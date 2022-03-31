# cmsn-electron-demo

![GitHub stars](https://img.shields.io/github/stars/Yongle-Fu/cmsn-electron-demo?color=fa6470&style=flat)
![GitHub issues](https://img.shields.io/github/issues/Yongle-Fu/cmsn-electron-demo?color=d8b22d&style=flat)
![GitHub license](https://img.shields.io/github/license/Yongle-Fu/cmsn-electron-demo?style=flat)
[![Required Node.JS >= v14.17.0](https://img.shields.io/static/v1?label=node&message=%3E=14.17.0&logo=node.js&color=3f893e&style=flat)](https://nodejs.org/about/releases)

**[English](README.md) | 简体中文**

## 概述

- Electron + Vite + React

- HMR

- Github Actions

## 运行

```shell
# kill -9 `pgrep Electron`

# install dependency
yarn install

# develop
yarn dev

# package
yarn dist

```

## 目录

一旦启动或打包脚本执行过，会在根目录产生 **`dist` 文件夹，里面的文件夹同 `packages` 一模一样**；在使用一些路径计算时，尤其是相对路径计算；`dist` 与 `packages` 里面保持相同的目录结构能避开好多问题

```tree
├
├── build                     用于生产构建的资源
├   ├── icon.icns             应用图标(macOS)
├   ├── icon.ico              应用图标
├   ├── installerIcon.ico     安装图标
├   ├── uninstallerIcon.ico   卸载图标
├
├── dist                      构建后，根据 packages 目录生成
├   ├── main
├   ├── preload
├   ├── renderer
├
├── release                   在生产构建后生成，包含可执行文件
├   ├── {version}
├       ├── win-unpacked      包含未打包的应用程序可执行文件
├       ├── Setup.exe         应用程序的安装程序
├
├── scripts
├   ├── build.mjs             项目开发脚本 npm run build
├   ├── watch.mjs             项目开发脚本 npm run dev
├
├── packages
├   ├── main                  主进程源码
├       ├── vite.config.ts
├   ├── preload               预加载脚本源码
├       ├── vite.config.ts
├   ├── renderer              渲染进程源码
├       ├── vite.config.ts
├
```

## 依赖放到 dependencies 还是 devDependencies

&emsp;&emsp;对待 **Electron-Main、Preload-Script** 时 vite 会以 lib 形式打包 commonjs 格式代码；
如果碰 node 环境的包可以直接放到 dependencies 中，vite 会解析为 require('xxxx')；
electron-builder 打包时候会将 dependencies 中的包打包到 app.asar 里面

&emsp;&emsp;对待 **Electron-Renderer** 时 vite 会以 ESM 格式解析代码；
像 vue、react 这种前端用的包可以直接被 vite 构建，所以不需要 vue、react 源码；
现实情况 vue、react 放到 dependencies 或 devDependencies 中都可以被正确构建；
但是放到 dependencies 会被 electron-builder 打包到 app.asar 里面导致包体变大；
所以放到 devDependencies 既能被正确构建还可以减小 app.asar 体积，一举两得

## 渲染进程使用 NodeJs API

> 🚧 因为安全的原因 Electron 默认不支持在 渲染进程 中使用 NodeJs API，但是有些小沙雕就是想这么干，拦都拦不住；实在想那么干的话，用另一个模板更方便 👉 **[electron-vite-boilerplate](https://github.com/caoxiemeihao/electron-vite-boilerplate)**

**推荐所有的 NodeJs、Electron API 通过 `Preload-script` 注入到 渲染进程中，例如：**

- **packages/preload/index.ts**

  ```typescript
  import fs from 'fs'
  import { contextBridge, ipcRenderer } from 'electron'

  // --------- Expose some API to Renderer-process. ---------
  contextBridge.exposeInMainWorld('fs', fs)
  contextBridge.exposeInMainWorld('ipcRenderer', ipcRenderer)
  ```

- **packages/renderer/src/global.d.ts**

  ```typescript
  // Defined on the window
  interface Window {
    fs: typeof import('fs')
    ipcRenderer: import('electron').IpcRenderer
  }
  ```

- **packages/renderer/main.ts**

  ```typescript
  // Use Electron, NodeJs API in Renderer-process
  console.log('fs', window.fs)
  console.log('ipcRenderer', window.ipcRenderer)
  ```

## 效果

<img width="400px" src="https://focus-resource.oss-accelerate.aliyuncs.com/universal/crimson-sdk-prebuild/node/cmsn-electron.png" />
