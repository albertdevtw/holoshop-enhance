<script lang="ts">
  import type { TFunction } from '@/src/i18n';
  import type { HeartState } from './types';

  let { state, t, onToggle }: { state: HeartState; t: TFunction; onToggle: () => void } = $props();

  const label = $derived(
    state === 'logged-out'
      ? t('product.loginRequired')
      : state === 'error'
        ? t('product.error')
        : state === 'on'
          ? t('product.favoriteRemove')
          : t('product.favoriteAdd'),
  );
</script>

<button
  type="button"
  class="heart"
  class:on={state === 'on'}
  class:error={state === 'error'}
  disabled={state === 'logged-out' || state === 'busy'}
  aria-pressed={state === 'on'}
  aria-label={label}
  title={label}
  onclick={onToggle}
>
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
    <path
      d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 5.3 3.1 1.7-1.9 3.2-3.1 5.3-3.1 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"
    />
  </svg>
</button>

<style>
  .heart {
    all: unset;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    cursor: pointer;
    color: #e5487a;
    background: #fff;
    border: 1px solid #f0c3d2;
    transition: transform 0.1s ease;
  }
  .heart:hover:not(:disabled) {
    transform: scale(1.08);
  }
  .heart:focus-visible {
    outline: 2px solid #e5487a;
    outline-offset: 2px;
  }
  .heart:disabled {
    cursor: default;
    opacity: 0.45;
  }
  .heart.error {
    border-color: #d1242f;
  }
  path {
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
  }
  .on path {
    fill: currentColor;
  }
</style>
