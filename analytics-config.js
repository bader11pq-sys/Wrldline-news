/* WRLDLINE analytics configuration.
   Leave both values empty to keep analytics disabled.
   ga4MeasurementId: e.g. "G-XXXXXXXXXX"
   endpoint: optional first-party collector URL that accepts a JSON POST.
   This file is public; never place a service-role key or secret here. */
window.WRLDLINE_ANALYTICS_CONFIG = Object.assign(
  { ga4MeasurementId: "", endpoint: "" },
  window.WRLDLINE_ANALYTICS_CONFIG || {}
);
