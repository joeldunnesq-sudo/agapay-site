# SheetJS browser parser

`xlsx-0.20.3.min.js` is an unmodified copy of `xlsx/dist/xlsx.mini.min.js`
from the pinned `xlsx` package in package-lock.json. `LICENSE` is copied
from the same package. It loads only in the directory import browser worker.

Source: https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
Documentation: https://docs.sheetjs.com/docs/getting-started/installation/nodejs/

When upgrading, update the pinned package and these files together, change the
browser worker's import URL, and run the directory import tests.
