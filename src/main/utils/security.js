import { app, protocol, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import mime from 'mime';
import originalfs from 'original-fs';

/**
 * 全局AES-GCM密钥，和encrypt-renderer.js中的AES_GCM_KEY保持一致（不可直接设置字符串，字节码不保护字符串）
 */
const AES_GCM_KEY = Buffer.from([0xd1, 0x25, 0xcf, 0x0a, 0xd5, 0x9d, 0x1c, 0x64, 0xee, 0xef, 0xda, 0xcb, 0xcd, 0x87, 0xfd, 0x6e, 0x6a, 0x16, 0xf2, 0x84, 0x6e, 0x13, 0xad, 0xa0, 0x09, 0x4e, 0xb9, 0x69, 0x67, 0xd0, 0x27, 0xae]);

/**
 * AES-GCM加密
 * @param {Buffer} data
 * @param {Buffer} key
 * @returns {Object}
 */
const aes_gcm_encrypt = (data, key) => {
    const iv = key.subarray(0, 16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([encrypted, tag]);
};

/**
 * AES-GCM解密
 * @param {Buffer} data
 * @param {Buffer} key
 * @returns {Buffer}
 */
const aes_gcm_decrypt = (data, key) => {
    const iv = key.subarray(0, 16);
    const tag = data.subarray(data.length - 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()]);
    return decrypted;
};

/**
 * 生成文件hash
 * @param {Buffer} data
 * @returns {Buffer}
 */
const generate_hash = (data) => {
    const hash = crypto.createHash('sha256');
    hash.update(data);
    return hash.digest();
};

/**
 * 安全检查
 */
const security = () => {
    /**
     * 禁止外部调试参数、代理参数
     */
    for (let i = 0; i < process.argv.length; i++) {
        const args = process.argv[i];
        if (args.includes('--inspect') || args.includes('--remote-debugging-port') || args.includes('--proxy')) {
            app.quit();
            process.exit(0);
        }
    }

    /**
     * 开发环境不进行安全检查，必须使用process.env.ELECTRON_RENDERER_URL作为判断，防止修改环境变量绕过安全检查
     * 确保加载窗口的地方也是使用process.env.ELECTRON_RENDERER_URL判断是否为开发环境
     * 这样如果他人修改process.env.ELECTRON_RENDERER_URL变量了，相对的渲染层也无法正常加载
     * （也许还有更好的方式，待发现）
     */
    if (process.env.ELECTRON_RENDERER_URL === undefined || process.env.ELECTRON_RENDERER_URL.startsWith('http://') === false) {
        /**
         * 判断当前模块的上级是否为入口文件（防止修改入口文件）
         */
        if (require.main !== module.parent) {
            dialog.showErrorBox('错误', '入口文件异常');
            app.quit();
            process.exit(0);
        }

        /**
         * 判断是否存在app.asar（electron入口加载顺序：app.asar -> app -> default_app.asar）（防止修改其它入口）
         */
        const asar_filename = path.resolve(app.getAppPath(), '../', 'app.asar');
        if (originalfs.existsSync(asar_filename) === false) {
            dialog.showErrorBox('错误', 'app.asar异常');
            app.quit();
            process.exit(0);
        }

        /**
         * 获取asar hash值
         */
        const asar_hash = generate_hash(originalfs.readFileSync(asar_filename));

        /**
         * 判断当前asar hash值是否正确，和v8快照进行对比（v8中存的是已加密的hash值，防止篡改v8快照）
         */
        // @ts-ignore
        if (ASAR_HASH === undefined || ASAR_HASH !== aes_gcm_encrypt(asar_hash, AES_GCM_KEY).toString('hex')) {
            console.log(`ASAR_HASH->${ASAR_HASH}`);
            dialog.showErrorBox('错误', 'ASAR_HASH异常');
            app.quit();
            process.exit(0);
        }
    }
};

/**
 * 渲染层协议
 */
const renderer_protocol = () => {
    /**
     * 标记协议头为特权协议，防止CSP拦截
     */
    protocol.registerSchemesAsPrivileged([
        {
            scheme: 'dtools',
            privileges: {
                bypassCSP: true,
                standard: true,
                secure: true,
                supportFetchAPI: true
            }
        }
    ]);

    app.once('ready', () => {
        /**
         * 注册自定义协议（新版electron请使用protocol.handle）
         * 具体协议头可以自行设定，但要在创建窗口时使用相同的协议头
         */
        protocol.registerBufferProtocol('dtools', (request, callback) => {
            try {
                const paths = request.url.replace('dtools://www.dtools.com/', '') || 'index.html';
                const filename = path.join(__dirname, '../../', 'dist/renderer/', paths);

                if (fs.existsSync(filename) === false) {
                    console.error('static 404 ->', filename);
                    callback({ statusCode: 404 });
                    return;
                }

                const buffer = fs.readFileSync(filename);
                const mimeType = mime.getType(filename) || 'application/octet-stream';
                const response = {
                    statusCode: 200,
                    mimeType: mimeType,
                    data: buffer,
                    headers: {
                        'Cache-Control': 'public, max-age=31536000'
                    }
                };

                /**
                 * 根据文件后缀名判断是否需要解密，和encrypt-renderer.js中的exts保持一致
                 */
                if (filename.endsWith('.js') || filename.endsWith('.html') || filename.endsWith('.css')) {
                    response.data = aes_gcm_decrypt(buffer, AES_GCM_KEY);
                }

                callback(response);
            } catch (error) {
                callback({
                    statusCode: 500,
                    mimeType: 'text/html',
                    data: Buffer.from(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>TOOLS</title></head><body style="height: 100vh;padding: 0;margin: 0;user-select: none;"><main style="height: 100%; display: flex;align-items: center;justify-content: center;position: absolute;top: 50%;transform: translateY(-60%);overflow: hidden;padding: 0 60px;"><div style="line-height: normal;display: flex;flex-direction: column;gap: 12px;"><div style="font-size: 32px;font-weight:900;color:blueviolet;">500</div><div style="color: rgb(20, 20, 20); font-size: 20px;font-weight: 600;">系统异常</div><div style="color: grey;overflow: hidden;">${error}</div></div></body></html>`)
                });
            }
        });
    });
};

export { security, renderer_protocol };
