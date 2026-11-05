<script lang="ts">
  let { label }: { label: string } = $props();
</script>

<span class="badge">{label}</span>

<style>
  .badge {
    display: inline-block;
    margin: 4px 0 0;
    padding: 1px 8px;
    border-radius: 999px;
    font: 600 12px/1.6 system-ui, -apple-system, 'Hiragino Sans', 'Noto Sans JP', sans-serif;
    color: #1a7f37;
    background: #dafbe1;
    border: 1px solid #a6e3b5;
  }
</style>
