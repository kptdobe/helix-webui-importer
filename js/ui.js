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
/* global CodeMirror, showdown, html_beautify, ExcelJS */
import { getDirectoryHandle, saveFile } from './filesystem.js';
import PollImporter from './pollimporter.js';
import { loadURLsFromRobots } from './sitemap.js';

const TRANSFORMER_CONTAINER = document.querySelector('.transformer');
const CRAWLER_CONTAINER = document.querySelector('.crawler');

const URLS_INPUT = document.getElementById('urls');
const OPTION_FIELDS = document.querySelectorAll('.optionField');
const IMPORTFILEURL_FIELD = document.querySelector('#importFileURL');
const IMPORT_BUTTON = document.getElementById('runImport');
const CRAWL_BUTTON = document.getElementById('runCrawl');
const PROCESS_BUTTONS = document.querySelectorAll('#runImport, #runCrawl');
const TABS_CONTAINER = document.querySelectorAll('.tabs-container');
// const SAVEASWORD_BUTTON = document.getElementById('saveAsWord');
const FOLDERNAME_SPAN = document.getElementById('folderName');
const GETURLSFROMROBOTS_BUTTON = document.getElementById('getURLsFromRobots');
const DOWNLOAD_IMPORT_REPORT_BUTTON = document.getElementById('downloadImportReport');
const DOWNLOAD_CRAWL_REPORT_BUTTON = document.getElementById('downloadCrawlReport');
const CRAWLED_URLS_HEADING = document.querySelector('#crawledURLs h2');
const CRAWLED_URLS_LIST = document.querySelector('#crawledURLs ul');
const MENUS = document.querySelectorAll('.container > div:not(.resizer)');
const RESIZERS = document.querySelectorAll('.resizer');
let mouseDown = false;
let mouseX = 0;

const ui = {};
const config = {};
const importStatus = {
  imported: 0,
  rows: [],
};

const crawlStatus = {
  crawled: 0,
  rows: [],
};

let dirHandle = null;

const setupUI = () => {
  ui.transformedEditor = CodeMirror.fromTextArea(document.getElementById('transformed'), {
    lineNumbers: true,
    mode: 'htmlmixed',
    theme: 'base16-dark',
  });
  ui.transformedEditor.setSize('100%', '100%');

  ui.markdownSource = document.getElementById('markdownSource');
  ui.markdownEditor = CodeMirror.fromTextArea(ui.markdownSource, {
    lineNumbers: true,
    mode: 'markdown',
    theme: 'base16-dark',
  });
  ui.markdownEditor.setSize('100%', '100%');

  ui.showdownConverter = new showdown.Converter();
  ui.markdownPreview = document.getElementById('markdownPreview');
  ui.markdownPreview.innerHTML = ui.showdownConverter.makeHtml('Run an import to see some markdown _OR_ crawl a site for a full list of URLs.');
};

const updateImporterUI = (out) => {
  const { md, html: outputHTML } = out;

  ui.transformedEditor.setValue(html_beautify(outputHTML));
  ui.markdownEditor.setValue(md || '');

  const mdPreview = ui.showdownConverter.makeHtml(md);
  ui.markdownPreview.innerHTML = mdPreview;

  // remove existing classes and styles
  Array.from(ui.markdownPreview.querySelectorAll('[class], [style]')).forEach((t) => {
    t.removeAttribute('class');
    t.removeAttribute('style');
  });
};

const updateCrawlerUI = (url) => {
  const a = document.createElement('a');
  a.href = url;
  a.textContent = url;
  a.target = '_blank';
  const li = document.createElement('li');
  li.append(a);
  CRAWLED_URLS_LIST.append(li);

  CRAWLED_URLS_HEADING.innerText = `Site URLs (${crawlStatus.crawled}):`;
};

const disableProcessButtons = () => {
  PROCESS_BUTTONS.forEach((button) => {
    button.disabled = true;
  });
};

const enableProcessButtons = () => {
  PROCESS_BUTTONS.forEach((button) => {
    button.disabled = false;
  });
};

const getProxyURLSetup = (url, origin) => {
  const u = new URL(url);
  if (!u.searchParams.get('host')) {
    u.searchParams.append('host', u.origin);
  }
  const src = `${origin}${u.pathname}${u.search}`;
  return {
    remote: {
      url,
      origin: u.origin,
    },
    proxy: {
      url: src,
      origin,
    },
  };
};

const createImporter = () => {
  config.importer = new PollImporter({
    origin: config.origin,
    poll: false,
    importFileURL: config.importFileURL,
  });
};

const attachListeners = () => {
  config.importer.addListener(async (out) => {
    const includeDocx = !!out.docx;
    updateImporterUI(out, includeDocx);
    const frame = document.getElementById('contentFrame');
    const data = {
      status: 'Success',
      url: frame.dataset.originalURL,
      path: out.path,
    };
    if (includeDocx) {
      const { docx, filename } = out;
      await saveFile(dirHandle, filename, docx);
      data.docx = filename;
    }
    importStatus.rows.push(data);
  });

  IMPORT_BUTTON.addEventListener('click', (async () => {
    TRANSFORMER_CONTAINER.classList.remove('hidden');
    CRAWLER_CONTAINER.classList.add('hidden');
    disableProcessButtons();
    if (config.localSave && !dirHandle) {
      try {
        dirHandle = await getDirectoryHandle();
        await dirHandle.requestPermission({
          mode: 'readwrite',
        });
        FOLDERNAME_SPAN.innerText = `Saving file(s) to: ${dirHandle.name}`;
        FOLDERNAME_SPAN.classList.remove('hidden');
      } catch (error) {
        // eslint-disable-next-line no-console
        console.log('No directory selected');
      }
    }

    DOWNLOAD_IMPORT_REPORT_BUTTON.classList.add('hidden');
    importStatus.imported = 0;
    importStatus.rows = [];

    const urlsArray = URLS_INPUT.value.split('\n').reverse().filter((u) => u.trim() !== '');
    const processNext = async () => {
      if (urlsArray.length > 0) {
        const url = urlsArray.pop();
        const { remote, proxy } = getProxyURLSetup(url, config.origin);
        const src = proxy.url;

        importStatus.imported += 1;
        // eslint-disable-next-line no-console
        console.log(`Importing: ${importStatus.imported} => ${src}`);

        const res = await fetch(src);
        if (res.ok) {
          if (res.redirected) {
            // eslint-disable-next-line no-console
            console.warn(`Cannot transform ${src} - redirected to ${res.url}`);
            const u = new URL(res.url);
            let redirect = res.url;
            if (u.origin === window.location.origin) {
              redirect = `${remote.origin}${u.pathname}`;
            }
            importStatus.rows.push({
              url,
              status: 'Redirect',
              redirect,
            });
            processNext();
          } else {
            const frame = document.createElement('iframe');
            frame.id = 'contentFrame';

            if (!config.enableJS) {
              frame.sandbox = 'allow-same-origin';
            }

            const onLoad = async () => {
              const includeDocx = !!dirHandle;

              window.setTimeout(async () => {
                const { originalURL } = frame.dataset;
                const { replacedURL } = frame.dataset;
                if (frame.contentDocument) {
                  try {
                    config.importer.setTransformationInput({
                      url: replacedURL,
                      document: frame.contentDocument,
                      includeDocx,
                    });
                    await config.importer.transform();
                  } catch (error) {
                    // eslint-disable-next-line no-console
                    console.error(`Cannot transform ${originalURL} - transformation error ?`, error);
                    // fallback, probably transformation error
                    importStatus.rows.push({
                      url: originalURL,
                      status: `Error: ${error.message}`,
                    });
                  }
                }

                const event = new Event('transformation-complete');
                frame.dispatchEvent(event);
              }, config.pageLoadTimeout || 1);
            };

            frame.addEventListener('load', onLoad);
            frame.addEventListener('transformation-complete', processNext);

            frame.dataset.originalURL = url;
            frame.dataset.replacedURL = src;
            frame.src = src;

            const current = document.getElementById('contentFrame');
            current.removeEventListener('load', onLoad);
            current.removeEventListener('transformation-complete', processNext);

            current.replaceWith(frame);
          }
        } else {
          // eslint-disable-next-line no-console
          console.warn(`Cannot transform ${src} - page may not exist (status ${res.status})`);
          importStatus.rows.push({
            url,
            status: `Invalid: ${res.status}`,
          });
          processNext();
        }
        // ui.markdownPreview.innerHTML = ui.showdownConverter.makeHtml('Import in progress...');
        // ui.transformedEditor.setValue('');
        // ui.markdownEditor.setValue('');
      } else {
        const frame = document.getElementById('contentFrame');
        frame.removeEventListener('transformation-complete', processNext);
        DOWNLOAD_IMPORT_REPORT_BUTTON.classList.remove('hidden');
        enableProcessButtons();
      }
    };
    processNext();
  }));

  CRAWL_BUTTON.addEventListener('click', (async () => {
    CRAWLER_CONTAINER.classList.remove('hidden');
    TRANSFORMER_CONTAINER.classList.add('hidden');
    disableProcessButtons();
    DOWNLOAD_CRAWL_REPORT_BUTTON.classList.add('hidden');
    crawlStatus.crawled = 0;
    crawlStatus.rows = [];
    crawlStatus.urls = [];

    const urlsArray = URLS_INPUT.value.split('\n').reverse().filter((u) => u.trim() !== '');
    const processNext = () => {
      if (urlsArray.length > 0) {
        const url = urlsArray.pop();
        const { proxy } = getProxyURLSetup(url, config.origin);
        const src = proxy.url;

        const frame = document.createElement('iframe');
        frame.id = 'contentFrame';

        if (!config.enableJS) {
          frame.sandbox = 'allow-same-origin';
        }

        const onLoad = async () => {
          window.setTimeout(async () => {
            const current = frame.dataset.originalURL;
            const originalURL = new URL(current);
            const replacedURL = new URL(frame.dataset.replacedURL);

            try {
              const links = frame.contentDocument.querySelectorAll('a') || [];
              let nbLinks = 0;
              let nbLinksExternalHost = 0;
              let nbLinksAlreadyProcessed = 0;
              const linksToFollow = [];
              links.forEach((a) => {
                nbLinks += 1;
                if (a.href) {
                  const u = new URL(a.href);
                  if (u.host === originalURL.host || u.host === replacedURL.host) {
                    const found = `${originalURL.origin}${u.pathname}${u.search}`;
                    // eslint-disable-next-line max-len
                    if (!crawlStatus.urls.includes(found) && !urlsArray.includes(found) && current !== found) {
                      urlsArray.push(found);
                      linksToFollow.push(found);
                    } else {
                      nbLinksAlreadyProcessed += 1;
                    }
                  } else {
                    nbLinksExternalHost += 1;
                  }
                }
              });

              crawlStatus.urls.push(current);
              const row = {
                url: current,
                status: 'Success',
                nbLinks,
                nbLinksAlreadyProcessed,
                nbLinksExternalHost,
                nbLinksToFollow: linksToFollow.length,
                linksToFollow,
              };
              crawlStatus.rows.push(row);
              crawlStatus.crawled += 1;

              updateCrawlerUI(current);
            } catch (error) {
              // try to detect redirects
              const res = await fetch(replacedURL);
              if (res.ok) {
                if (res.redirected) {
                  // eslint-disable-next-line no-console
                  console.error(`Cannot crawl ${originalURL} - redirected to ${res.url}`, error);
                  crawlStatus.rows.push({
                    url: originalURL,
                    status: 'Redirect',
                    redirect: res.url,
                  });
                } else {
                  // eslint-disable-next-line no-console
                  console.error(`Cannot crawl ${originalURL} - probably a code error on ${res.url}`, error);
                  crawlStatus.rows.push({
                    url: originalURL,
                    status: `Code error: ${res.status}`,
                  });
                }
              } else {
                // eslint-disable-next-line no-console
                console.error(`Cannot crawl ${originalURL} - page may not exist (status ${res.status})`, error);
                crawlStatus.rows.push({
                  url: originalURL,
                  status: `Invalid: ${res.status}`,
                });
              }
            }

            const event = new Event('crawling-complete');
            frame.dispatchEvent(event);
          }, config.pageLoadTimeout || 1);
        };

        frame.addEventListener('load', onLoad);
        frame.addEventListener('crawling-complete', processNext);

        frame.dataset.originalURL = url;
        frame.dataset.replacedURL = src;
        frame.src = src;

        const current = document.getElementById('contentFrame');
        current.removeEventListener('load', onLoad);
        current.removeEventListener('crawling-complete', processNext);

        current.replaceWith(frame);
      } else {
        const frame = document.getElementById('contentFrame');
        frame.removeEventListener('crawling-complete', processNext);
        DOWNLOAD_CRAWL_REPORT_BUTTON.classList.remove('hidden');
        enableProcessButtons();
      }
    };
    processNext();
  }));

  RESIZERS.forEach((resizer) => {
    const prev = resizer.previousElementSibling;
    const next = resizer.nextElementSibling;
    resizer.ondblclick = () => {
      MENUS.forEach((menu) => {
        menu.style.flex = '0 0 0';
        menu.setAttribute('aria-expanded', false);
      });
      next.style.flex = '0 1 100%';
      next.setAttribute('aria-expanded', true);
    };
    if (prev && next) {
      resizer.onmousedown = (down) => {
        mouseDown = true;
        mouseX = down.clientX;
        resizer.parentNode.onmousemove = (move) => {
          if (mouseDown) {
            let maxWidth = -1;
            [...MENUS, ...RESIZERS].forEach((menu) => { maxWidth += menu.offsetWidth; });
            // eslint-disable-next-line no-nested-ternary
            const direction = move.pageX < mouseX ? -(Math.abs(move.pageX - mouseX))
              : move.pageX > mouseX ? Math.abs(move.pageX - mouseX)
                : 0;
            mouseX = move.clientX;
            if (direction < 0) {
              prev.style.flex = `1 0 ${prev.offsetWidth - Math.abs(direction)}px`;
              next.style.flex = `0 1 ${next.offsetWidth + Math.abs(direction)}px`;
              next.setAttribute('aria-expanded', true);
            } else if (direction > 0 && maxWidth <= prev.parentNode.offsetWidth) {
              prev.style.flex = `1 0 ${prev.offsetWidth + Math.abs(direction)}px`;
              next.style.flex = `0 1 ${next.offsetWidth - Math.abs(direction)}px`;
              prev.setAttribute('aria-expanded', true);
            }
          }
        };
      };
      resizer.parentNode.onmouseup = () => {
        if (mouseDown) {
          mouseDown = false;
          mouseX = 0;
        }
      };
    }
  });

  OPTION_FIELDS.forEach((field) => {
    field.addEventListener('change', () => {
      const value = field.type === 'checkbox' ? field.checked : field.value;
      config[field.id] = value;
      localStorage.setItem(`option-field-${field.id}`, value);
    });
  });

  IMPORTFILEURL_FIELD.addEventListener('change', (event) => {
    if (config.importer) {
      config.importer.setImportFileURL(event.target.value);
    }
  });

  TABS_CONTAINER.forEach((container) => {
    const buttons = container.querySelectorAll('.tab');
    buttons.forEach((button) => {
      button.addEventListener('click', (evt) => {
        const { tab } = evt.target.dataset;

        buttons.forEach((p) => {
          if (p.dataset.tab === tab) {
            p.classList.add('active');
          } else {
            p.classList.remove('active');
          }
        });

        container.querySelectorAll('.panels > div').forEach((p) => {
          if (p.dataset.panel === tab) {
            p.classList.remove('hidden');
          } else {
            p.classList.add('hidden');
          }
          ui.markdownEditor.refresh();
          ui.transformedEditor.refresh();
        });
      });
    });
  });

  DOWNLOAD_IMPORT_REPORT_BUTTON.addEventListener('click', (async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sheet 1');
    worksheet.addRows([
      ['URL', 'path', 'docx', 'status', 'redirect'],
    ].concat(importStatus.rows.map(({
      url,
      path,
      docx,
      status,
      redirect,
    }) => [url, path, docx || '', status, redirect || ''])));
    const buffer = await workbook.xlsx.writeBuffer();
    const a = document.createElement('a');
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    a.setAttribute('href', URL.createObjectURL(blob));
    a.setAttribute('download', 'import_report.xlsx');
    a.click();
  }));

  DOWNLOAD_CRAWL_REPORT_BUTTON.addEventListener('click', (async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sheet 1');
    worksheet.addRows([
      ['URL', 'status', 'redirect', 'Nb links on page', 'Nb links already processed', 'Nb links on external host', 'Nb links to follow', 'Links to follow'],
    ].concat(crawlStatus.rows.map(({
      // eslint-disable-next-line max-len
      url,
      status,
      redirect,
      nbLinks,
      nbLinksAlreadyProcessed,
      nbLinksExternalHost,
      nbLinksToFollow,
      linksToFollow,
    }) => [
      url, status, redirect || '', nbLinks || '', nbLinksAlreadyProcessed || '', nbLinksExternalHost || '', nbLinksToFollow || '', linksToFollow ? linksToFollow.join(', ') : '',
    ])));
    const buffer = await workbook.xlsx.writeBuffer();
    const a = document.createElement('a');
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    a.setAttribute('href', URL.createObjectURL(blob));
    a.setAttribute('download', 'crawl_report.xlsx');
    a.click();
  }));

  GETURLSFROMROBOTS_BUTTON.addEventListener('click', (async () => {
    // use prompt for now util we get a better UI element
    // eslint-disable-next-line no-alert
    const host = window.prompt('Please provide the host');
    const urls = await loadURLsFromRobots(config.origin, host);
    if (urls === 0) {
      // eslint-disable-next-line no-alert
      alert(`No urls found. robots.txt or sitemap might not exist on ${config.origin}`);
    } else {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Sheet 1');
      worksheet.addRows([
        ['URL'],
      ].concat(urls.map((u) => [u])));
      const buffer = await workbook.xlsx.writeBuffer();
      const a = document.createElement('a');
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      a.setAttribute('href', URL.createObjectURL(blob));
      a.setAttribute('download', 'urls.xlsx');
      a.click();
    }
  }));
};

const init = () => {
  config.origin = window.location.origin;
  OPTION_FIELDS.forEach((field) => {
    const value = localStorage.getItem(`option-field-${field.id}`);
    if (value !== null) {
      if (field.type === 'checkbox') {
        field.checked = (value === 'true');
      } else {
        field.value = value;
      }
    }

    config[field.id] = field.type === 'checkbox' ? field.checked : field.value;
  });

  createImporter();

  setupUI();
  attachListeners();
};

init();
