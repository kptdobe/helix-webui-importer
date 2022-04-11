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
/* eslint-disable class-methods-use-this, no-console */

import path from 'path';
import { JSDOM } from 'jsdom';
import {
  PageImporter,
  PageImporterResource,
  DOMUtils,
  Blocks,
  MemoryHandler,
} from '@adobe/helix-importer';

import docxStylesXML from '../resources/styles.xml';

function preprocessDOM(document) {
  const elements = document.querySelectorAll('body, header, footer, div, span, section, main');
  const getComputedStyle = document.defaultView?.getComputedStyle;
  if (getComputedStyle) {
    elements.forEach((element) => {
      // css background images will be lost -> write them in the DOM
      const style = getComputedStyle(element);
      if (style['background-image'] && style['background-image'].toLowerCase() !== 'none') {
        element.style['background-image'] = style['background-image'];
      }
    });
  }
}

async function html2x(url, doc, transformCfg, toMd, toDocx, preprocess = true) {
  let name = 'index';
  let dirname = '';

  if (preprocess) {
    preprocessDOM(doc);
  }
  const html = doc.documentElement.outerHTML;
  class InternalImporter extends PageImporter {
    async fetch() {
      return new Response(html);
    }

    async process(document) {
      let output = document.body;
      if (transformCfg && transformCfg.transformDOM) {
        output = transformCfg.transformDOM({ url, document });
      }
      output = output || document.body;

      if (transformCfg && transformCfg.generateDocumentPath) {
        const p = transformCfg.generateDocumentPath({ url, document });
        if (p) {
          name = path.basename(p);
          dirname = path.dirname(p);
        }
      }

      const pir = new PageImporterResource(name, dirname, output, null, {
        html: output.outerHTML,
      });
      return [pir];
    }
  }

  const logger = {
    debug: () => {},
    info: () => {},
    log: () => {},
    warn: (...args) => console.error(...args),
    error: (...args) => console.error(...args),
  };

  const storageHandler = new MemoryHandler(logger);
  const importer = new InternalImporter({
    storageHandler,
    skipDocxConversion: !toDocx,
    skipMDFileCreation: !toMd,
    logger,
    mdast2docxOptions: {
      stylesXML: docxStylesXML,
      svg2png: async (svg) => new Promise((resolve) => {
        const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
        const svgUrl = URL.createObjectURL(svgBlob);
        const img = new Image();
        img.src = svgUrl;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
          }
          const canvasData = canvas.toDataURL('image/png');
          const canvas64 = canvasData.replace(/^data:image\/(png|jpg);base64,/, '');
          resolve(canvas64);
        };
      }),
    },
  });

  const pirs = await importer.import(url);

  const res = {
    html: pirs[0].extra.html,
  };

  if (name !== 'index') {
    res.name = name;
    res.dirname = dirname;
    res.path = `${dirname}/${name}`;
  } else {
    res.path = `/${name}`;
  }

  if (toMd) {
    const md = await storageHandler.get(pirs[0].md);
    res.md = md;
  }
  if (toDocx) {
    const docx = await storageHandler.get(pirs[0].docx);
    res.docx = docx;
  }
  return res;
}

async function html2md(url, document, transformCfg, preprocess) {
  let doc = document;
  if (typeof document === 'string') {
    doc = new JSDOM(document, { runScripts: undefined }).window.document;
  }
  return html2x(url, doc, transformCfg, true, false, preprocess);
}

async function html2docx(url, document, transformCfg, preprocess) {
  let doc = document;
  if (typeof document === 'string') {
    doc = new JSDOM(document, { runScripts: undefined }).window.document;
  }
  return html2x(url, doc, transformCfg, true, true, preprocess);
}

export {
  Blocks,
  DOMUtils,
  html2md,
  html2docx,
};
