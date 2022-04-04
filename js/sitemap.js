/*
 * Copyright 2022 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
async function loadSitemap(sitemapURL) {
  const resp = await fetch(sitemapURL);
  const xml = await resp.text();
  const sitemap = (new window.DOMParser()).parseFromString(xml, 'text/xml');
  const subSitemaps = [...sitemap.querySelectorAll('sitemap loc')];
  let urls = [];
  const promises = subSitemaps.map((loc) => new Promise((resolve) => {
    const subSitemapURL = new URL(loc.textContent);
    loadSitemap(subSitemapURL.pathname).then((result) => {
      urls = urls.concat(result);
      resolve(true);
    });
  }));

  await Promise.all(promises);

  const urlLocs = sitemap.querySelectorAll('url loc');
  urlLocs.forEach((loc) => {
    urls.push(loc.textContent);
  });

  return urls;
}

async function loadURLsFromRobots(href) {
  let urls = [];
  // const url = new URL(href);
  // url.pathname = '/robots.txt';
  // url.search = '';
  // const res = await fetch(url.toString());
  // if (res.ok) {
  //   const text = await res.text();
  //   // eslint-disable-next-line no-console
  //   console.log('found robots.txt', text);
  //   const regex = /^[Ss]itemap:\s*(.*)$/gm;
  //   let m;
  //   const sitemaps = [];
  //   // eslint-disable-next-line no-cond-assign
  //   while ((m = regex.exec(text)) !== null) {
  //     if (m.index === regex.lastIndex) {
  //       regex.lastIndex += 1;
  //     }

  //     sitemaps.push(m[1]);
  //   }

    // eslint-disable-next-line no-console
    const sitemaps = ['https://www.westjet.com/book/sitemap-index.xml'];
    console.log('sitemaps', sitemaps);

    const promises = sitemaps.map((sitemap) => new Promise((resolve) => {
      loadSitemap(sitemap).then((u) => {
        urls = urls.concat(u);
        resolve();
      });
    }));

    await Promise.all(promises);
  // } else {
  //   // eslint-disable-next-line no-console
  //   console.log('No robots.txt found');
  // }
  return urls;
}

export {
  loadSitemap,
  loadURLsFromRobots,
};
