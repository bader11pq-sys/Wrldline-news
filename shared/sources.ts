// Enable a feed only after checking publisher ownership and syndication policy.
export const trustedSources = [
  {publisher:'BBC عربي',group:'bbc',domain:'bbc.com',rss:'https://feeds.bbci.co.uk/arabic/rss.xml'},
  {publisher:'BBC',group:'bbc',domain:'bbc.co.uk',rss:'https://feeds.bbci.co.uk/news/business/rss.xml'},
  {publisher:'الجزيرة',group:'aljazeera',domain:'aljazeera.net',rss:'https://www.aljazeera.net/aljazeerarss'},
  {publisher:'الجزيرة',group:'aljazeera',domain:'aljazeera.com',rss:'https://www.aljazeera.com/xml/rss/all.xml'},
  {publisher:'فرانس 24',group:'francemediasmonde',domain:'france24.com',rss:'https://www.france24.com/ar/rss'},
  {publisher:'رويترز',group:'thomsonreuters',domain:'reuters.com',rss:''},
  {publisher:'أسوشيتد برس',group:'ap',domain:'apnews.com',rss:''},
  {publisher:'دويتشه فيله',group:'dw',domain:'dw.com',rss:'https://rss.dw.com/rdf/rss-ar-all'}
];
