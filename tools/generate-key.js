const crypto = require('crypto');

const key = crypto
    .randomBytes(32)
    .toString('hex')
    .match(/.{1,2}/g)
    .map((v) => `0x${v}`)
    .join(',');

console.log(`const aes_key = Buffer.from([${key}]);`);

/**
 * AES加密
 * @param {Buffer} data
 * @param {Buffer} key
 * @returns
 */
const AES_ENCRYPT = (data, key) => {
    try {
        const iv = key.subarray(0, 16);
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
        return encrypted;
    } catch (error) {
        console.error(error);
        return undefined;
    }
};

/**
 * AES解密
 * @param {Buffer} data
 * @param {Buffer} key
 * @returns
 */
const AES_DECRYPT = (data, key) => {
    try {
        const iv = key.subarray(0, 16);
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
        return decrypted;
    } catch (error) {
        console.error(error);
        return undefined;
    }
};

/**
 * AES-GCM加密
 * @param {Buffer} data
 * @param {Buffer} key
 * @returns {Object}
 */
const AES_GCM_ENCRYPT = (data, key) => {
    const iv = key.subarray(0, 16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const tag = cipher.getAuthTag();
    return XorEncryptDecrypt(Buffer.concat([encrypted, tag]), key);
};

/**
 * AES-GCM解密
 * @param {Buffer} encryptedData
 * @param {Buffer} key
 * @returns {Buffer}
 */
const AES_GCM_DECRYPT = (encryptedData, key) => {
    const data = XorEncryptDecrypt(encryptedData, key);
    const iv = key.subarray(0, 16);
    const tag = data.subarray(data.length - 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()]);
    return decrypted;
};

/**
 * XOR异或加密/解密
 * @param {Buffer} data - 要加密/解密的数据
 * @param {Buffer} key - 用于异或运算的密钥
 * @returns {Buffer} - 加密/解密后的数据
 */
const XorEncryptDecrypt = (data, key) => {
    const output = Buffer.alloc(data.length);
    for (let i = 0; i < data.length; i++) {
        output[i] = data[i] ^ key[i % key.length];
    }
    return output;
};

const aes_key = Buffer.from([0x6b, 0xe5, 0x51, 0x77, 0x3b, 0x07, 0xec, 0x2b, 0x60, 0x1e, 0x09, 0xe4, 0xaa, 0x88, 0x65, 0xe2, 0x65, 0x54, 0xb3, 0x58, 0x50, 0x6a, 0x18, 0xfc, 0x2e, 0x85, 0x31, 0x83, 0x8a, 0x06, 0x87, 0x4f]);

const data = Buffer.from('hello world');

// 加密
const encrypted = AES_GCM_ENCRYPT(data, aes_key);
console.log('Encrypted:', encrypted);

// 解密
const decrypted = AES_GCM_DECRYPT(encrypted, aes_key);
console.log('Decrypted:', decrypted.toString('utf-8'));
