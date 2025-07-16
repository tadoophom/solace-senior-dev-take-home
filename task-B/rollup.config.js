import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';

export default {
  input: 'src/index.js',
  output: {
    file: 'dist/esm/index.js',
    format: 'esm',
    exports: 'named'
  },
  plugins: [
    nodeResolve({ preferBuiltins: false }),
    commonjs()
  ]
}; 