### electron-vite-encrypt-demo

基于[electron-vite](https://github.com/alex8088/electron-vite 'electron-vite') 的asar防篡改，渲染层代码加密方案演示

### 核心逻辑

利用electron-builder的afterPack钩子，重新打包asar  
打包过程利用createPackageWithOptions的transform实现加密

### 防篡改原理

在afterPack钩子里读取app.asar的哈希值，加密后写入v8快照  
主进程入口（index.jsc）判断哈希值是否匹配

### 引入的npm包

mime - 用于渲染层自定义协议的类型判断  
electron-mksnapshot - 生成electron的v8快照，**版本必须和electron一致**  
@electron/asar - 用于解压/打包asar文件

### 对比electron-vite脚手架改动文件

tools - 该目录下为打包过程需要的文件  
src/main/index.js - 渲染层改用loadURL加载自定义协议的方式  
src/main/utils/security.js - 防篡改核心、自定义渲染层协议（渲染层加密）  
electron.vite.config.mjs - 修改了输出路径，排除了original-fs模块（如需修改输出路径，请修改tools目录对应文件的路径）  
package.json - 入口文件路径

### 加强建议

demo中只使用了aes-gcm一层加密，比较容易被人猜中（因为密钥是有可能可以通过hook获取到的）  
建议再增加一层加密，比如异或算法

### 已知问题

版本最高只支持到electron v26.6.10，可能是electron-mksnapshot在v27版本开始和bytenode有冲突，具体原因未知  
MacOS需要自行修改对应的路径，还有v8_context_snapshot.bin的名称之类的
