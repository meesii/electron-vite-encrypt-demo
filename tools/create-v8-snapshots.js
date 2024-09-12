const child_process = require('child_process');
const path = require('path');
const fs = require('fs/promises');
const JavaScriptObfuscator = require('javascript-obfuscator');

/**
 * 检查文件是否存在
 * @param {*} filePath
 * @returns
 */
async function check_file_exists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * 拷贝文件
 * @param {*} srcDir
 * @param {*} destDir
 */
async function copy_files(srcDir, destDir) {
    const files = await fs.readdir(srcDir);
    for (const file of files) {
        const src = path.resolve(srcDir, file);
        const dest = path.resolve(destDir, file);
        const stat = await fs.stat(src);
        if (stat.isDirectory()) {
            await fs.mkdir(dest);
            await copy_files(src, dest);
        } else {
            await fs.copyFile(src, dest);
            await fs.unlink(src);
        }
    }
}

/**
 * 生成V8快照
 * @param {String} elestron_dir - Electron（win-unpacked）目录
 * @param {Buffer} asar_hash    - app.asar的hash
 */
async function generate(elestron_dir, asar_hash) {
    const snapshot_filename = path.resolve(__dirname, 'snapshot.js');
    const snapshot_cache_filename = path.resolve(__dirname, './cache/snapshot.js');
    const outdir = path.resolve(__dirname, 'cache');
    const mksnapshot = path.resolve(__dirname, '..', 'node_modules', '.bin', 'mksnapshot' + (process.platform === 'win32' ? '.cmd' : ''));

    try {
        let snapshot_code = await fs.readFile(snapshot_filename, 'utf8');

        // 替换asar_hash到snapshot.js
        snapshot_code = snapshot_code.replace("global.ASAR_HASH = '';", `global.ASAR_HASH = '${asar_hash.toString('hex')}';`);

        // 混淆代码
        const obfuscate = JavaScriptObfuscator.obfuscate(snapshot_code, {
            controlFlowFlattening: true,
            seed: 10,
            splitStrings: true,
            target: 'node'
        });
        snapshot_code = obfuscate.getObfuscatedCode();

        // 重新写入snapshot.js
        await fs.writeFile(snapshot_cache_filename, snapshot_code);

        const child = child_process.spawnSync(mksnapshot, [snapshot_cache_filename, '--output_dir', outdir], { stdio: 'pipe', shell: true });

        if (child.error || child.stderr?.length > 0) {
            throw child.error || child.stderr.toString();
        }

        const stdout = child.stdout.toString();
        if (stdout.includes('Loading script for embedding')) {
            const snapshot_bin = path.resolve(outdir, 'snapshot_blob.bin');
            const v8_context_snapshot = path.resolve(outdir, 'v8_context_snapshot.bin');

            // 检查文件是否存在
            if ((await check_file_exists(snapshot_bin)) === false || (await check_file_exists(v8_context_snapshot)) === false) {
                throw new Error(`mksnapshot failed: file not found`);
            }

            await fs.unlink(snapshot_cache_filename);

            await copy_files(outdir, elestron_dir);
        } else {
            throw new Error(`mksnapshot failed: ${stdout}`);
        }
    } catch (error) {
        throw error;
    }
}

module.exports = { generate };
