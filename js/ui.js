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

const URLS_INPUT = document.getElementById('urls');
const OPTION_FIELDS = document.querySelectorAll('.optionField');
const IMPORT_BUTTON = document.getElementById('runImport');
const TABS_CONTAINER = document.querySelectorAll('.tabs-container');
// const SAVEASWORD_BUTTON = document.getElementById('saveAsWord');
const FOLDERNAME_SPAN = document.getElementById('folderName');
const GETURLSFROMROBOTS_BUTTON = document.getElementById('getURLsFromRobots');
const DOWNLOADREPORT_BUTTON = document.getElementById('downloadReport');

const ui = {};
const config = {};
const importStatus = {
  imported: 0,
  rows: []
};

let dirHandle = null;

const setupUI = () => {
  ui.transformedEditor = CodeMirror.fromTextArea(document.getElementById('transformed'), {
    lineNumbers: true,
    mode: 'htmlmixed',
    theme: 'base16-dark',
  });
  ui.transformedEditor.setSize('100%', '460');

  ui.markdownSource = document.getElementById('markdownSource');
  ui.markdownEditor = CodeMirror.fromTextArea(ui.markdownSource, {
    lineNumbers: true,
    mode: 'markdown',
    theme: 'base16-dark',
  });
  ui.markdownEditor.setSize('100%', '460');

  ui.showdownConverter = new showdown.Converter();
  ui.markdownPreview = document.getElementById('markdownPreview');
  ui.markdownPreview.innerHTML = ui.showdownConverter.makeHtml('# Run an import to see some markdown.');
};

const updateUI = (out) => {
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

const attachListeners = () => {
  config.importer.addListener(async (out) => {
    const includeDocx = !!out.docx;
    updateUI(out, includeDocx);
    const frame = document.getElementById('contentFrame');
    const data = {
      status: 'success',
      url: frame.dataset.originalUrl,
      path: out.path,
    }
    if (includeDocx) {
      const { docx, filename } = out;
      await saveFile(dirHandle, filename, docx);
      data.docx = filename;
    }
    importStatus.rows.push(data);
  });

  IMPORT_BUTTON.addEventListener('click', (async () => {
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

    DOWNLOADREPORT_BUTTON.classList.add('hidden');
    importStatus.imported = 0;
    importStatus.rows = [];

    const urlsArray = URLS_INPUT.value.split('\n').reverse().filter((u) => u.trim() !== '');
    const processNext = () => {
      if (urlsArray.length > 0) {
        const url = urlsArray.pop();
        let src = url;
        if (config.hostReplace && config.hostReplace !== '') {
          const u = new URL(url);
          src = `${config.hostReplace}${u.pathname}${u.search}`;
        }

        const frame = document.createElement('iframe');
        frame.id = 'contentFrame';

        const onLoad = async () => {
          const includeDocx = !!dirHandle;
      
          window.setTimeout(async () => {
            const originalURL = frame.dataset.originalUrl;
            try {
              const replacedURL = frame.contentDocument.location.href;
              config.importer.setTransformationInput({
                url: replacedURL,
                document: frame.contentDocument,
                includeDocx,
              });
              importStatus.imported += 1;
              console.log(`Imported: ${importStatus.imported}`);
              await config.importer.transform();
            } catch (error) {
              // eslint-disable-next-line no-console
              console.error(`Cannot transform ${originalURL}`, error);
              importStatus.rows.push({
                url: originalURL,
                status: `Error: ${error.message}`,
              });
            }
      
            const event = new Event('transformation-complete');
            frame.dispatchEvent(event);
          }, config.pageLoadTimeout || 1);
        };

        frame.addEventListener('load', onLoad);
        frame.addEventListener('transformation-complete', processNext);

        frame.dataset.originalUrl = url;
        frame.src = src;

        const current = document.getElementById('contentFrame');
        current.removeEventListener('load', onLoad);
        current.removeEventListener('transformation-complete', processNext);
        
        current.replaceWith(frame);

        ui.markdownPreview.innerHTML = ui.showdownConverter.makeHtml('# Import in progress...');
        ui.transformedEditor.setValue('');
        ui.markdownEditor.setValue('');
      } else {
        const frame = document.getElementById('contentFrame');
        frame.removeEventListener('transformation-complete', processNext);
        DOWNLOADREPORT_BUTTON.classList.remove('hidden');
      }
    };
    processNext();
  }));

  OPTION_FIELDS.forEach((field) => {
    field.addEventListener('change', () => {
      const value = field.type === 'checkbox' ? field.checked : field.value;
      config[field.id] = value;
      localStorage.setItem(`option-field-${field.id}`, value);
    });
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

  DOWNLOADREPORT_BUTTON.addEventListener('click', (async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sheet 1');
    worksheet.addRows([['URL', 'path', 'docx', 'status']].concat(importStatus.rows.map(({ url, path, docx, status }) => [url, path, docx || '', status])));
    const buffer = await workbook.xlsx.writeBuffer();
    const a = document.createElement('a');
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    a.setAttribute('href', URL.createObjectURL(blob));
    a.setAttribute('download', 'report.xlsx');
    a.click();
  }));

  GETURLSFROMROBOTS_BUTTON.addEventListener('click', (async () => {
    const urls = await loadURLsFromRobots(config.hostReplace);
    if (urls === 0) {
      // eslint-disable-next-line no-alert
      alert(`No urls found. robots.txt or sitemap might not exist on ${config.hostReplace}`);
    } else {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Sheet 1');
      worksheet.addRows([['URL']].concat(urls.map((u) => [u])));
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

  config.importer = new PollImporter({
    poll: false,
    importFileURL: config.importFileURL,
  });

  setupUI();
  attachListeners();
};

init();
