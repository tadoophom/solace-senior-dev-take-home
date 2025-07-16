import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';
import json from '@rollup/plugin-json';

export default {
  input: 'src/index.js',
  output: {
    file: 'dist/esm/index.js',
    format: 'esm',
    exports: 'named',
    inlineDynamicImports: true
  },
  plugins: [
    // Resolve browser-specific entry points and avoid Node built-ins
    nodeResolve({ browser: true, preferBuiltins: false }),
    // Allow importing JSON files
    json(),
    // Convert CommonJS modules to ESModules
    commonjs()
  ]
}; 