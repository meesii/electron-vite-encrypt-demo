const asar = require('@electron/asar');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const stream = require('stream');

const { generate } = require('./create-v8-snapshots.js');

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
 * @param {*} filename
 * @returns {Promise<Buffer>}
 */
const generate_hash = async (filename) => {
    const hash = crypto.createHash('sha256');
    hash.update(await fs.readFile(filename));
    return hash.digest();
};

/**
 * 全局AES-GCM密钥，可以运行npm run generate生成新的密钥
 * 请和src/main/utils/security.js中的密钥保持一致
 */
const AES_GCM_KEY = Buffer.from([0xd1, 0x25, 0xcf, 0x0a, 0xd5, 0x9d, 0x1c, 0x64, 0xee, 0xef, 0xda, 0xcb, 0xcd, 0x87, 0xfd, 0x6e, 0x6a, 0x16, 0xf2, 0x84, 0x6e, 0x13, 0xad, 0xa0, 0x09, 0x4e, 0xb9, 0x69, 0x67, 0xd0, 0x27, 0xae]);

exports.default = async (context) => {
    try {
        const start_time = new Date().getTime();
        const asar_filename = path.resolve(context.appOutDir, 'resources', 'app.asar');
        const asar_dir = path.resolve(context.appOutDir, 'resources', 'app');
        const exts = ['.js', '.html', '.css']; // 需要加密的文件后缀名

        // 解压asar
        asar.extractAll(asar_filename, asar_dir);

        // 删除原有asar
        await fs.unlink(asar_filename);

        // 重新生成入口js文件
        const index_code = `"use strict";launcher(module,"./index.jsc");`;
        const index_filename = path.join(asar_dir, 'dist/main/index.js');
        await fs.writeFile(index_filename, index_code, 'utf8');

        // 删除bytecode-loader.cjs（已写入到v8快照）
        await fs.unlink(path.join(asar_dir, 'dist/main/bytecode-loader.cjs'));

        // 重新打包asar，并对渲染层指定后缀名的文件进行加密
        await asar.createPackageWithOptions(asar_dir, asar_filename, {
            transform: (filename) => {
                const dir = path.join(asar_dir, 'dist/renderer');
                if (path.dirname(filename).includes(dir) && exts.includes(path.extname(filename))) {
                    const chunks = [];
                    return new stream.Transform({
                        transform(chunk, encoding, callback) {
                            chunks.push(chunk);
                            callback();
                        },
                        flush(callback) {
                            const buffer = aes_gcm_encrypt(Buffer.concat(chunks), AES_GCM_KEY);
                            callback(null, buffer);
                        }
                    });
                }
            }
        });

        // 计算新hash
        const asar_hash = await generate_hash(asar_filename);

        // 删除解压目录
        await fs.rm(asar_dir, { recursive: true });

        // 生成V8快照
        await generate(context.appOutDir, aes_gcm_encrypt(asar_hash, AES_GCM_KEY));

        const end_time = new Date().getTime();
        const duration = (end_time - start_time) / 1000;
        console.log(`\x1B[31m  • \x1B[33mencrypt\x1B[0m         \x1B[34mduration\x1B[0m:${duration}s \x1B[34mhash\x1B[0m:${asar_hash.toString('hex')}\x1B[0m`);
    } catch (e) {
        throw e;
    }
};
