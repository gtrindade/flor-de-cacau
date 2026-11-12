<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { notificationDuration, notifyError, notifySuccess } from '#lib/notifications';
  let {
    form,
    savedMessage,
    notificationId = 'form-feedback'
  }: {
    form?: { error?: string; success?: string } | null;
    savedMessage?: string;
    notificationId?: string;
  } = $props();
  let previous: typeof form;
  let announcedSaved = false;
  let enhanced = $state(false);
  let showSuccess = $state(true);
  onMount(() => {
    enhanced = true;
  });
  $effect(() => {
    const message = form?.success || savedMessage;
    if (form?.error || !message) {
      showSuccess = false;
      return;
    }
    showSuccess = true;
    const timer = setTimeout(() => {
      showSuccess = false;
    }, notificationDuration);
    return () => clearTimeout(timer);
  });
  $effect(() => {
    const response = form;
    const saved = savedMessage;
    if (response !== previous) {
      previous = response;
      untrack(() => {
        if (response?.error) notifyError(response.error, notificationId);
        else if (response?.success) notifySuccess(response.success, notificationId);
      });
    }
    if (saved && !announcedSaved) {
      announcedSaved = true;
      if (!response?.success && !response?.error)
        untrack(() => notifySuccess(saved, notificationId));
    }
  });
</script>

{#if form?.error}<p class="form-error" role="alert" aria-live={enhanced ? 'off' : undefined}>
    {form.error}
  </p>{/if}
{#if showSuccess && (form?.success || savedMessage)}<p
    class="success"
    role="status"
    aria-live={enhanced ? 'off' : undefined}
  >
    {form?.success || savedMessage}
  </p>{/if}
