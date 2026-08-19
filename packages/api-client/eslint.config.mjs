// B-049 (Faz 4.5 commit 7b): bu paket artık kök `pnpm run lint` (turbo run lint) kapsamında.
// Kurallar workspace'in ortak paket tabanından gelir — parser dahil (bkz.
// @repo/config/eslint/package.mjs).
import packageConfig from '@repo/config/eslint/package.mjs'

export default packageConfig
