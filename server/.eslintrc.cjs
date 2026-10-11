module.exports = {
  root: true,
  env: { node: true, es2022: true, jest: true },
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: ['dist', 'drizzle', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
}
