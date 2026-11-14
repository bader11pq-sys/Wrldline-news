
-- RSS source sections are the authoritative article categories; AI category cron is retired separately.
update public.feeds
set category = 'politics'
where url = 'https://feeds.bloomberg.com/politics/news.rss';

insert into public.feeds (name, url, lang, category, active)
values
  ('BBC Sport', 'https://feeds.bbci.co.uk/sport/rss.xml', 'en', 'sports', true),
  ('BBC Sport Football', 'https://feeds.bbci.co.uk/sport/football/rss.xml', 'en', 'sports', true),
  ('BBC Politics', 'https://feeds.bbci.co.uk/news/politics/rss.xml', 'en', 'politics', true),
  ('BBC Business', 'https://feeds.bbci.co.uk/news/business/rss.xml', 'en', 'economy', true),
  ('BBC Business Economy', 'https://feeds.bbci.co.uk/news/business/economy/rss.xml', 'en', 'economy', true),
  ('BBC Technology', 'https://feeds.bbci.co.uk/news/technology/rss.xml', 'en', 'tech', true),
  ('BBC Health', 'https://feeds.bbci.co.uk/news/health/rss.xml', 'en', 'health', true),
  ('BBC Science and Environment', 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml', 'en', 'tech', true),
  ('BBC Entertainment and Arts', 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml', 'en', 'culture', true),
  ('Guardian Politics', 'https://www.theguardian.com/politics/rss', 'en', 'politics', true),
  ('Guardian Business', 'https://www.theguardian.com/business/rss', 'en', 'economy', true),
  ('Guardian Technology', 'https://www.theguardian.com/technology/rss', 'en', 'tech', true),
  ('Guardian Sport', 'https://www.theguardian.com/sport/rss', 'en', 'sports', true),
  ('Sky Sports News', 'https://www.skysports.com/rss/12040', 'en', 'sports', true),
  ('Reuters Sports (Google News section RSS)', 'https://news.google.com/rss/search?q=site%3Areuters.com%2Fsports+when%3A1h&hl=en-US&gl=US&ceid=US:en', 'en', 'sports', true),
  ('Reuters Politics (Google News section RSS)', 'https://news.google.com/rss/search?q=site%3Areuters.com%2Fworld%2Fpolitics+when%3A1h&hl=en-US&gl=US&ceid=US:en', 'en', 'politics', true),
  ('Reuters Business (Google News section RSS)', 'https://news.google.com/rss/search?q=site%3Areuters.com%2Fbusiness+when%3A1h&hl=en-US&gl=US&ceid=US:en', 'en', 'economy', true),
  ('AP Sports (Google News section RSS)', 'https://news.google.com/rss/search?q=site%3Aapnews.com%2Fhub%2Fsports+when%3A1h&hl=en-US&gl=US&ceid=US:en', 'en', 'sports', true),
  ('AP Politics (Google News section RSS)', 'https://news.google.com/rss/search?q=site%3Aapnews.com%2Fhub%2Fpolitics+when%3A1h&hl=en-US&gl=US&ceid=US:en', 'en', 'politics', true),
  ('AP Business (Google News section RSS)', 'https://news.google.com/rss/search?q=site%3Aapnews.com%2Fhub%2Fbusiness+when%3A1h&hl=en-US&gl=US&ceid=US:en', 'en', 'economy', true),
  ('CNN Sports', 'http://rss.cnn.com/rss/edition_sport.rss', 'en', 'sports', true),
  ('CNN Politics', 'http://rss.cnn.com/rss/edition_politics.rss', 'en', 'politics', true),
  ('CNN Business', 'http://rss.cnn.com/rss/edition_business.rss', 'en', 'economy', true),
  ('CNN Technology', 'http://rss.cnn.com/rss/edition_technology.rss', 'en', 'tech', true),
  ('CNN Health', 'http://rss.cnn.com/rss/edition_health.rss', 'en', 'health', true),
  ('CNN Entertainment', 'http://rss.cnn.com/rss/edition_entertainment.rss', 'en', 'culture', true)
on conflict (url) do update
set name = excluded.name,
    lang = excluded.lang,
    category = excluded.category,
    active = true;
