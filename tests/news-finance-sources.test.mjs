import test from 'node:test';
import assert from 'node:assert/strict';
import {FEEDS,normalizeFeed,localize,fetchText} from '../scripts/collect-news.mjs';
import {FINANCE_SOURCES,RESTRICTED_FINANCE_SOURCES} from '../scripts/news-finance-sources.mjs';
const rss=(publisher,link='https://news.google.com/rss/articles/verified')=>`<rss><channel><item><title>台股財經新聞 - MoneyDJ</title><link>${link}</link><source url="${publisher}">MoneyDJ</source><pubDate>Fri, 02 Oct 2026 06:00:00 GMT</pubDate></item></channel></rss>`;
test('aggregate headlines require matching publisher domain and retain provenance',()=>{
 const f={...FINANCE_SOURCES.find(f=>f.id==='wantgoo'),domain:'moneydj.com'};const [item]=normalizeFeed(rss('https://www.moneydj.com'),f);
 assert.equal(item.title,'台股財經新聞');assert.equal(item.publisher,'MoneyDJ');assert.equal(item.aggregation,'Google News RSS');assert.equal(item.verified,'aggregated-headline');
 assert.equal(normalizeFeed(rss('https://moneydj.com.fake.test'),f).length,0);
 assert.equal(normalizeFeed(rss('https://www.moneydj.com','https://evil.test/article'),f).length,0);
 assert.equal(localize(item).titleZh,item.title);
});
test('finance feed preserves timestamp, original language and restrictive sources are not collected',()=>{
 const f=FEEDS.find(f=>f.id==='investing');const [item]=normalizeFeed('<rss><channel><item><title>Markets update</title><link>https://www.investing.com/news/economy-news/1</link><pubDate>2026-10-02 06:18:26</pubDate></item></channel></rss>',f);
 assert.equal(item.publishedAt,'2026-10-02T06:18:26.000Z');assert.equal(localize(item).translationStatus,'original');assert.equal(localize(item).titleZh,null);
 assert.equal(FEEDS.some(f=>f.id==='jin10'),false);assert.equal(RESTRICTED_FINANCE_SOURCES[0].access,'authorization-required');
 assert.equal(new Set(FEEDS.map(f=>f.id)).size,FEEDS.length);assert.equal(FINANCE_SOURCES.length,8);
});
test('official portal feeds retain dated headlines and declare portal provenance',()=>{
 const yahoo=FEEDS.find(f=>f.id==='yahoo');
 const xml=`<rss><channel><item><title>台股市場收盤</title><link>https://tw.news.yahoo.com/finance-123.html</link><pubDate>Fri, 02 Oct 2026 06:00:00 GMT</pubDate></item></channel></rss>`;
 const [item]=normalizeFeed(xml,yahoo);
 assert.equal(item.verified,'portal-feed');assert.equal(item.aggregation,'Yahoo RSS');assert.equal(item.feedUrl,yahoo.url);
 assert.equal(normalizeFeed(xml.replace('tw.news.yahoo.com','news.yahoo.com.evil.test'),yahoo).length,0);
});
test('PChome public XML uses Taiwan time without allowing arbitrary XML roots',()=>{
 const pchome=FEEDS.find(f=>f.id==='pchome');
 const xml='<news><item><title><![CDATA[台股財經新聞]]></title><link>https://news.pchome.com.tw/finance/cna/20261002/example.html</link><pubdate>2026-10-02 15:16:49</pubdate><desc>Do not republish this body</desc></item><item><title>Undated</title><link>https://news.pchome.com.tw/finance/undated</link></item></news>';
 const [item]=normalizeFeed(xml,pchome);
 assert.equal(normalizeFeed(xml,pchome).length,1);assert.equal(item.publishedAt,'2026-10-02T07:16:49.000Z');
 assert.equal(item.verified,'portal-feed');assert.equal(item.description,undefined);assert.equal(item.desc,undefined);
 assert.throws(()=>normalizeFeed(xml,FEEDS.find(f=>f.id==='ltn')),/RSS/);
 assert.equal(normalizeFeed(xml.replace('news.pchome.com.tw/finance/cna','www.bls.gov/feed'),pchome).length,0);
});
test('DIGITIMES keeps explicit publisher timezone and does not copy descriptions',()=>{
 const feed=FEEDS.find(f=>f.id==='digitimes');
 const [item]=normalizeFeed('<rss><channel><item><title>半導體產業新聞</title><link>https://www.digitimes.com.tw/tech/dt/n/shwnws.asp?id=123</link><pubDate>Fri, 02 Oct 2026 05:13:01   +0800</pubDate><description>Article body</description></item></channel></rss>',feed);
 assert.equal(item.publishedAt,'2026-10-01T21:13:01.000Z');assert.equal(item.description,undefined);
 assert.equal(item.aggregation,undefined);assert.equal(item.verified,'publisher-feed');
});
test('RSS hosted off-site accepts only the publisher article domain',()=>{
 const f=FEEDS.find(f=>f.id==='cna');const xml=url=>`<rss><channel><item><title>中央通訊社財經新聞</title><link>${url}</link><pubDate>Fri, 02 Oct 2026 06:00:00 GMT</pubDate></item></channel></rss>`;
 assert.equal(normalizeFeed(xml('https://www.cna.com.tw/news/afe/202610020001.aspx'),f).length,1);
 assert.equal(normalizeFeed(xml('https://www.bls.gov/feed'),f).length,0);
});
test('168 finance categories exclude politics and uncategorized content',()=>{
 const f=FEEDS.find(f=>f.id==='168');
 const entry=(category,url)=>`<item><title>財經資訊標題</title><link>https://168abc.net/${url}</link><pubDate>Fri, 02 Oct 2026 06:03:37 +0000</pubDate>${category.map(c=>`<category>${c}</category>`).join('')}</item>`;
 const xml=`<rss><channel>${entry(['168看電視','張震'],'168-tv/32140')}${entry(['政經時事','頭條'],'0000/32137')}${entry(['168看電視','政經時事'],'0000/32139')}${entry([],'unknown')}${entry(['江慶財專欄'],'analyst-view/jiang-qc/32130')}</channel></rss>`;
 const items=normalizeFeed(xml,f);assert.equal(items.length,2);assert.ok(items.every(i=>!/0000|unknown/.test(i.link)));assert.equal(items[0].publishedAt,'2026-10-02T06:03:37.000Z');
});
test('financial publishers accept only their own dated article links',()=>{
 for(const id of ['moneydj','cnyes','udn']){
  const f=FEEDS.find(f=>f.id===id);const xml=url=>`<rss><channel><item><title>台股財經新聞</title><link>${url}</link><pubDate>Fri, 02 Oct 2026 15:22:19 +0800</pubDate><description>Not republished</description></item></channel></rss>`;
  const [item]=normalizeFeed(xml(`https://${f.hosts[0]}/news/one`),f);assert.equal(item.publishedAt,'2026-10-02T07:22:19.000Z');assert.equal(item.description,undefined);assert.equal(normalizeFeed(xml('https://www.bls.gov/wrong-publisher'),f).length,0);
 }
});
test('collector accepts native text/xml content negotiation without changing identity',async t=>{
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 globalThis.fetch=async(_url,options)=>{assert.match(options.headers.Accept,/(?:^|, )text\/xml(?:,|$)/);assert.equal(options.headers['User-Agent'],'Mozilla/5.0 (compatible; OXNews/1.0)');return new Response('<rss><channel/></rss>',{status:200,headers:{'content-type':'text/xml'}});};
 assert.equal(await fetchText('https://www.digitimes.com.tw/tech/rss/xml/xmlrss_10_0.xml'),'<rss><channel/></rss>');
});
test('CTEE policy RSS is explicitly scoped and strictly filters financial headlines',()=>{
 const f=FEEDS.find(f=>f.id==='ctee');
 const entry=(title,id)=>`<item><title>${title}</title><link>https://www.ctee.com.tw/news/${id}</link><pubDate>2026-10-02T15:28:45</pubDate></item>`;
 const items=normalizeFeed(`<rss><channel>${entry('央行討論利率與通膨政策','finance')}${entry('地方議會議事爭議','politics')}${entry('藝人演唱會售票','entertainment')}${entry('總統視察軍事基地','military')}</channel></rss>`,f);
 assert.equal(f.scopeLabel,'財經篩選 RSS');assert.equal(items.length,1);assert.equal(items[0].publishedAt,'2026-10-02T07:28:45.000Z');assert.equal(items[0].sourceId,'ctee');
 assert.equal(normalizeFeed(`<rss><channel>${entry('地方議會議事爭議','politics')}</channel></rss>`,f).length,0);
});
