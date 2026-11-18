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
    // Fail closed: do not add to paused/backlogged queues unless an operator
    // explicitly opts in after the queue consumers and Supabase handlers are healthy.
    if (env.WRLDLINE_PRODUCERS_ENABLED !== "true") {
      console.warn(JSON.stringify({
        event: "producers_paused",
        cron,
        enabled: false,
        reason: "WRLDLINE_PRODUCERS_ENABLED is not explicitly true",
        scheduled_at: new Date(scheduledTime).toISOString(),
      }));
      return;
    }
    switch (cron) {
      case "* * * * *":
        await enqueue(env.CLASSIFICATION_QUEUE, "classification", scheduledTime);
        break;
      case "*/2 * * * *":
        await enqueue(env.BREAKING_QUEUE, "breaking", scheduledTime);
        break;
      case "*/3 * * * *":
        await enqueue(env.GENERAL_QUEUE, "general", scheduledTime);
        break;
      case "*/5 * * * *":
        await enqueue(env.TRANSLATION_QUEUE, "translation", scheduledTime);
        break;
      default:
        console.warn(JSON.stringify({ event: "unknown_cron", cron }));
    }
    console.log(JSON.stringify({ event: "jobs_enqueued", cron, scheduled_at: new Date(scheduledTime).toISOString() }));
  },

  async queue(batch, env) {
    for (const message of batch.messages) {
      const authCheck = message.body?.task === "auth-check";
      const providerHealthcheck = message.body?.task === "provider-healthcheck";
      const validTasks = ["general", "breaking", "classification", "translation"];
      const authCheckSupportedQueues = ["wrldline-news-general", "wrldline-news-classification"];
      const task = providerHealthcheck && batch.queue === "wrldline-news-general"
        ? { functionName: "ai-provider-healthcheck", body: {} }
        : authCheck && batch.queue === "wrldline-news-general"
          ? { functionName: "wrldline-news-ingest", body: { mode: "auth-check" } }
          : authCheck && batch.queue === "wrldline-news-classification"
            ? { functionName: "classify-news-worker", body: { mode: "auth-check" } }
            : QUEUE_TASKS[batch.queue];
      if (!task || (authCheck && !authCheckSupportedQueues.includes(batch.queue)) ||
          (providerHealthcheck && batch.queue !== "wrldline-news-general") ||
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
