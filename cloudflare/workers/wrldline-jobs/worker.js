const SUPABASE_URL = "https://vmaxbnogmmfyrcucapnq.supabase.co";
const MAX_QUEUE_MESSAGE_AGE_MS = 15 * 60 * 1000;

const QUEUE_TASKS = {
  "wrldline-news-general": { functionName: "wrldline-news-ingest", body: { mode: "general" } },
  "wrldline-news-breaking": { functionName: "wrldline-news-ingest", body: { mode: "breaking" } },
  "wrldline-news-classification": { functionName: "classify-news-worker", body: {} },
  "wrldline-news-translation": { functionName: "wrldline-news-ingest", body: { mode: "translation" } },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function enqueue(queue, task, scheduledTime) {
  await queue.send({
    task,
    scheduled_at: new Date(scheduledTime).toISOString(),
    enqueued_at: new Date().toISOString(),
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "wrldline-jobs", queues: Object.keys(QUEUE_TASKS) });
    }
    return json({ error: "Not found" }, 404);
  },

  async scheduled(controller, env) {
    const cron = controller.cron;
    const scheduledTime = controller.scheduledTime;
    const routes = {
      "* * * * *": {
        binding: "CLASSIFICATION_QUEUE",
        task: "classification",
        switchName: "WRLDLINE_CLASSIFICATION_PRODUCER_ENABLED",
      },
      "*/2 * * * *": {
        binding: "BREAKING_QUEUE",
        task: "breaking",
        switchName: "WRLDLINE_BREAKING_PRODUCER_ENABLED",
      },
      "*/3 * * * *": {
        binding: "GENERAL_QUEUE",
        task: "general",
        switchName: "WRLDLINE_GENERAL_PRODUCER_ENABLED",
      },
      "*/5 * * * *": {
        binding: "TRANSLATION_QUEUE",
        task: "translation",
        switchName: "WRLDLINE_TRANSLATION_PRODUCER_ENABLED",
      },
    };
    const route = routes[cron];
    if (!route) {
      console.warn(JSON.stringify({ event: "unknown_cron", cron }));
      return;
    }

    // The global opt-in remains supported, but each pipeline can now be
    // enabled independently. Missing switches always fail closed.
    const enabled = env.WRLDLINE_PRODUCERS_ENABLED === "true" ||
      env[route.switchName] === "true";
    if (!enabled) {
      console.warn(JSON.stringify({
        event: "producers_paused",
        cron,
        task: route.task,
        queue_binding: route.binding,
        enabled: false,
        reason: route.switchName + " is not explicitly true (global override also disabled)",
        scheduled_at: new Date(scheduledTime).toISOString(),
      }));
      return;
    }

    await enqueue(env[route.binding], route.task, scheduledTime);
    console.log(JSON.stringify({
      event: "jobs_enqueued",
      cron,
      task: route.task,
      queue_binding: route.binding,
      scheduled_at: new Date(scheduledTime).toISOString(),
    }));
  },

  async queue(batch, env) {
    for (const message of batch.messages) {
      const authCheck = message.body?.task === "auth-check";
      const providerHealthcheck = message.body?.task === "provider-healthcheck";
      const validTasks = ["general", "breaking", "classification", "translation"];
      const authCheckSupportedQueues = ["wrldline-news-general", "wrldline-news-classification"];
      const providerHealthcheckSupportedQueues = ["wrldline-news-general", "wrldline-news-classification"];
      const task = providerHealthcheck && providerHealthcheckSupportedQueues.includes(batch.queue)
        ? { functionName: "ai-provider-healthcheck", body: {} }
        : authCheck && batch.queue === "wrldline-news-general"
          ? { functionName: "wrldline-news-ingest", body: { mode: "auth-check" } }
          : authCheck && batch.queue === "wrldline-news-classification"
            ? { functionName: "classify-news-worker", body: { mode: "auth-check" } }
            : QUEUE_TASKS[batch.queue];
      if (!task || (authCheck && !authCheckSupportedQueues.includes(batch.queue)) ||
          (providerHealthcheck && !providerHealthcheckSupportedQueues.includes(batch.queue)) ||
          (message.body?.task && message.body.task !== "healthcheck" &&
           message.body.task !== "auth-check" && message.body.task !== "provider-healthcheck" &&
           !validTasks.includes(message.body.task))) {
        console.error(JSON.stringify({ event: "invalid_queue_message", queue: batch.queue, message_id: message.id }));
        message.ack();
        continue;
      }

      if (message.body?.task === "healthcheck") {
        message.ack();
        console.log(JSON.stringify({ event: "queue_healthcheck", queue: batch.queue, message_id: message.id }));
        continue;
      }

      const scheduledAt = Date.parse(String(message.body?.scheduled_at || ""));
      if (!Number.isFinite(scheduledAt)) {
        console.error(JSON.stringify({
          event: "invalid_queue_schedule_timestamp",
          queue: batch.queue,
          message_id: message.id,
        }));
        message.ack();
        continue;
      }
      const ageMs = Date.now() - scheduledAt;
      if (ageMs > MAX_QUEUE_MESSAGE_AGE_MS) {
        message.ack();
        console.warn(JSON.stringify({
          event: "stale_schedule_message_skipped",
          queue: batch.queue,
          message_id: message.id,
          task: message.body?.task,
          scheduled_at: new Date(scheduledAt).toISOString(),
          age_seconds: Math.floor(ageMs / 1000),
        }));
        continue;
      }

      if (!env.SUPABASE_PUBLISHABLE_KEY || !env.WRLDLINE_CRON_SECRET) {
        console.error(JSON.stringify({ event: "missing_worker_secrets", queue: batch.queue, message_id: message.id }));
        message.retry({ delaySeconds: 120 });
        continue;
      }

      try {
        const response = await fetch(
          SUPABASE_URL + "/functions/v1/" + task.functionName,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "apikey": env.SUPABASE_PUBLISHABLE_KEY,
              "x-wrldline-cron-secret": env.WRLDLINE_CRON_SECRET,
            },
            body: JSON.stringify(task.body),
            signal: AbortSignal.timeout(180000),
          },
        );
        const responseText = await response.text();
        if (response.ok) {
          message.ack();
          console.log(JSON.stringify({
            event: "supabase_job_completed",
            queue: batch.queue,
            message_id: message.id,
            task: message.body?.task,
            status: response.status,
            attempts: message.attempts,
            response_excerpt: responseText.slice(0, 350),
          }));
        } else {
          const delaySeconds = Math.min(300, 30 * (2 ** Math.max(0, message.attempts - 1)));
          console.error(JSON.stringify({
            event: "supabase_job_failed",
            queue: batch.queue,
            message_id: message.id,
            task: message.body?.task,
            status: response.status,
            attempts: message.attempts,
            response_excerpt: responseText.slice(0, 350),
            retry_in_seconds: delaySeconds,
          }));
          message.retry({ delaySeconds });
        }
      } catch (error) {
        const delaySeconds = Math.min(300, 30 * (2 ** Math.max(0, message.attempts - 1)));
        console.error(JSON.stringify({
          event: "supabase_job_network_error",
          queue: batch.queue,
          message_id: message.id,
          task: message.body?.task,
          attempts: message.attempts,
          error: String(error?.message || error).slice(0, 220),
          retry_in_seconds: delaySeconds,
        }));
        message.retry({ delaySeconds });
      }
    }
  },
};
