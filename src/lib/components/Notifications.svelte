<script lang="ts">
  import { Toaster } from 'svelte-sonner';
  import { notificationDuration } from '#lib/notifications';
</script>

<Toaster
  position="top-center"
  theme="light"
  richColors
  closeButton
  expand
  duration={notificationDuration}
  visibleToasts={3}
  pauseWhenPageIsHidden
  offset={{ top: 'max(16px, env(safe-area-inset-top))', left: '16px', right: '16px' }}
  mobileOffset={{ top: 'max(12px, env(safe-area-inset-top))', left: '12px', right: '12px' }}
  containerAriaLabel="Notificações"
  closeButtonAriaLabel="Fechar notificação"
  toastOptions={{ class: 'flora-toast' }}
/>
