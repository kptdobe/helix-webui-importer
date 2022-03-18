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
/* global CodeMirror, showdown, html_beautify */
import { getDirectoryHandle, saveFile } from './filesystem.js';
import PollImporter from './pollimporter.js';

const CONTENT_FRAME = document.getElementById('contentFrame');
const URLS_INPUT = document.getElementById('urls');
const IMPORT_BUTTON = document.getElementById('runImport');
const TABS_BUTTONS = document.querySelectorAll('.tabs .tab');
const SAVEASWORD_BUTTON = document.getElementById('save');

const importer = new PollImporter({
  poll: false,
});

const ui = {};

let dirHandle = null;

const setup = () => {
  ui.transformedEditor = CodeMirror.fromTextArea(document.getElementById('transformed'), {
    lineNumbers: true,
    mode: 'htmlmixed',
    theme: 'base16-dark',
  });
  ui.transformedEditor.setSize('100%', '440');

  ui.markdownSource = document.getElementById('markdownSource');
  ui.markdownEditor = CodeMirror.fromTextArea(ui.markdownSource, {
    lineNumbers: true,
    mode: 'markdown',
    theme: 'base16-dark',
  });
  ui.markdownEditor.setSize('100%', '440');

  ui.showdownConverter = new showdown.Converter();
  ui.markdownPreview = document.getElementById('markdownPreview');
  ui.markdownPreview.innerHTML = ui.showdownConverter.makeHtml('# Run import first!');
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

  SAVEASWORD_BUTTON.classList.remove('hidden');
};

const attachListeners = () => {
  CONTENT_FRAME.addEventListener('load', async () => {
    const includeDocx = !!dirHandle;

    window.setTimeout(async () => {
      try {
        importer.setTransformationInput({
          url: CONTENT_FRAME.contentDocument.location.href,
          document: CONTENT_FRAME.contentDocument,
        });
        const out = await importer.transform(includeDocx);
        updateUI(out);
        if (includeDocx) {
          const { docx, filename } = out;
          await saveFile(dirHandle, filename, docx);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`Cannot transform ${CONTENT_FRAME.contentDocument.location.href}`, error);
      }

      const event = new Event('transformation-complete');
      CONTENT_FRAME.dispatchEvent(event);
    }, 2000);
  });

  IMPORT_BUTTON.addEventListener('click', (async () => {
    if (!dirHandle) {
      try {
        dirHandle = await getDirectoryHandle();
      } catch (error) {
        console.log('No directory selected');
      }
    }

    const urlsArray = URLS_INPUT.value.split('\n').reverse().filter((u) => u.trim() !== '');
    const processNext = () => {
      ui.markdownPreview.innerHTML = ui.showdownConverter.makeHtml('# Work in progress...');
      ui.transformedEditor.setValue('');
      ui.markdownEditor.setValue('');
      if (urlsArray.length > 0) {
        const url = urlsArray.pop();
        const u = new URL(url, window.location.href);
        CONTENT_FRAME.src = u.pathname;
      } else {
        CONTENT_FRAME.removeEventListener('transformation-complete', processNext);
      }
    };
    CONTENT_FRAME.addEventListener('transformation-complete', processNext);
    processNext();
  }));

  URLS_INPUT.addEventListener('change', () => {
    localStorage.setItem('urls-input', URLS_INPUT.value);
  });

  TABS_BUTTONS.forEach((button) => {
    button.addEventListener('click', (evt) => {
      const { tab } = evt.target.dataset;

      TABS_BUTTONS.forEach((p) => {
        if (p.dataset.tab === tab) {
          p.classList.add('active');
        } else {
          p.classList.remove('active');
        }
      });

      document.querySelectorAll('.panels > div').forEach((p) => {
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

  SAVEASWORD_BUTTON.addEventListener('click', (async () => {
    const { docx, filename } = await importer.transform(true);

    const a = document.createElement('a');
    const blob = new Blob([docx], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    a.setAttribute('href', URL.createObjectURL(blob));
    a.setAttribute('download', filename);
    a.click();
  }));
};

const init = () => {
  const item = localStorage.getItem('urls-input');
  if (item) {
    URLS_INPUT.value = item;
  }

  setup();
  attachListeners();
};

init();
