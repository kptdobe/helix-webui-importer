# Helix Importer tool

WIP

## Usage

In a folder of your Helix project (e.g. tools/importer), run: 

```
git clone https://github.com/kptdobe/helix-webui-importer
````

At the root of the project, run:

```
hlx up --pagesUrl {https://host_of_pages_to_be_imported.com}
```

Assuming you cloned the project in tools/importer, navigate to: http://localhost:3000/tools/importer/helix-webui-importer/index.html

In the `URL(s)` field, give a list of page URLs to be imported (e.g. {https://host_of_pages_to_be_imported.com/page_1.html}) and hit the import button. The page(s) will be loaded in the central frame and the Markdown transfomation will happen in the right frame. Result of the transformation will be saved as a Word document on your local file system (target folder is asked and tool needs permissions to write).

## Transformation file

A default html to Markdown is applied by you can / need to provide your own. Initially the import transformation file is fetched at http://localhost:3000/tools/importer/import.js (can be changed in the options). Create the file using the following template:

https://gist.github.com/kptdobe/8a726387ecca80dde2081b17b3e913f7

## Options

- `Local save as docx`: enable / disable the save as docx to the local file system. Disabling is useful when working on the `import.js` transformation and checking the docx is not necessarily at that time.
- `Import file URL`: url of the import transformation file
- `Page load timeout`: the transformation uses the target page DOM. This DOM might take some time to be fully decorated. You can reduce the timeout if your transformation does not need to wait or extend if the DOM takes longer to be fully complete
- `Host replace`: with the `--pagesUrl` parameter of `hlx up`, target pages are proxied via localhost. This helps to get rid of the security constrainst. If the target site does not have CSP and CORS headers, you do not need to replace the host of the urls. Just empty the field or change it to another proxy.

## Cache

During the import process, imported resources can be cache locally. After the first import, the files could be served from local file system. To enable the cache:

```
hlx up --pagesUrl {https://host_of_pages_to_be_imported.com} --alpha-cache .cache/
```

In the `.cache/` folder of the project, you will find all html pages, js, css, images... files requested on the specified host.