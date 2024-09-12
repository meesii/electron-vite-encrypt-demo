/**
 * 重写electron-vite字节码的bytecode-loader.cjs文件（非必要，也可只写入asah的哈希值到v8快照中）
 * @param {*} module module对象
 * @param {*} filename index.jsc文件
 */
function launcher(module, filename) {
    const bytecode_runtime = {
        FLAG_HASH_OFFSET: 12,
        SOURCE_HASH_OFFSET: 8,
        DUMMY_BYTECODE: null,
        initialize_dummy_bytecode: (vm) => {
            if (!bytecode_runtime.DUMMY_BYTECODE) {
                const script = new vm.Script('', { produceCachedData: true });
                bytecode_runtime.DUMMY_BYTECODE = script.createCachedData();
            }
        },
        set_flag_hash_header: (bytecodeBuffer, vm) => {
            bytecode_runtime.initialize_dummy_bytecode(vm);
            bytecode_runtime.DUMMY_BYTECODE.slice(bytecode_runtime.FLAG_HASH_OFFSET, bytecode_runtime.FLAG_HASH_OFFSET + 4).copy(bytecodeBuffer, bytecode_runtime.FLAG_HASH_OFFSET);
        },
        get_source_hash_header: (bytecodeBuffer) => {
            return bytecodeBuffer.slice(bytecode_runtime.SOURCE_HASH_OFFSET, bytecode_runtime.SOURCE_HASH_OFFSET + 4);
        }
    };

    const Module = module.require('module');

    const fs = module.require('fs');
    const path = module.require('path');
    const vm = module.require('vm');
    const v8 = module.require('v8');
    v8.setFlagsFromString('--no-lazy --no-flush-bytecode');

    Module._extensions['.jsc'] = Module._extensions['.cjsc'] = function (module, filename) {
        const bytecodeBuffer = fs.readFileSync(filename);
        if (Buffer.isBuffer(bytecodeBuffer) === false) {
            throw new Error('BytecodeBuffer must be a buffer object.');
        }

        bytecode_runtime.set_flag_hash_header(bytecodeBuffer, vm);
        const length = bytecode_runtime.get_source_hash_header(bytecodeBuffer).readUInt32LE(0);
        const dummyCode = length > 1 ? '"' + '\u200b'.repeat(length - 2) + '"' : '';

        const script = new vm.Script(dummyCode, {
            filename,
            lineOffset: 0,
            displayErrors: true,
            cachedData: bytecodeBuffer
        });

        if (script.cachedDataRejected) {
            throw new Error('Invalid or incompatible cached data (cachedDataRejected)');
        }

        const require = (id) => module.require(id);
        require.resolve = (request, options) => Module._resolveFilename(request, module, false, options);
        if (process.mainModule) {
            require.main = process.mainModule;
        }
        require.extensions = Module._extensions;
        require.cache = Module._cache;

        const compiledWrapper = script.runInThisContext({
            filename,
            lineOffset: 0,
            columnOffset: 0,
            displayErrors: true
        });

        const dirname = path.dirname(filename);

        // 等待electron-builder钩子写入hash值
        // 写入到.jsc文件的global中，.js文件无法获取，devtools控制台也无法获取
        global.ASAR_HASH = '';

        const args = [module.exports, require, module, filename, dirname, process, global];
        return compiledWrapper.apply(module.exports, args);
    };

    // 加载index.jsc文件
    module.require(filename);
}
