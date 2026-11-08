<script lang="ts">
  let { size = 22, variant = 'white' }: { size?: number; variant?: 'white' | 'green' } = $props();
</script>

<img
  class="whatsapp-icon"
  src={`/brand/whatsapp-glyph-${variant}.svg`}
  alt=""
  aria-hidden="true"
  width={size}
  height={size}
  draggable="false"
/>

<style>
  .whatsapp-icon {
    display: inline-block;
    flex-shrink: 0;
    object-fit: contain;
  }
</style>
