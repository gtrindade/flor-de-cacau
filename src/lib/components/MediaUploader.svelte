<script lang="ts">
  import Upload from '@lucide/svelte/icons/upload';
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import X from '@lucide/svelte/icons/x';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import { onDestroy, onMount, untrack } from 'svelte';
  type Photo = { id: string; url: string; alt?: string };
  type PendingUpload = {
    key: string;
    file: File;
    preview: string;
    progress: number;
    error?: string;
    pending: boolean;
    xhr?: XMLHttpRequest;
  };
  let {
    initial = [],
    name = 'mediaIds',
    max = 8,
    busy = $bindable(false)
  }: { initial?: Photo[]; name?: string; max?: number; busy?: boolean } = $props();
  let ready = $state(false);
  onMount(() => {
    ready = true;
  });
  let photos = $state<Photo[]>(untrack(() => [...initial]));
  let uploads = $state<PendingUpload[]>([]);
  let input: HTMLInputElement;
  let error = $state('');
  let uploadCounter = 0;
  $effect(() => {
    busy = uploads.some((u) => u.pending || u.error);
  });
  function send(upload: PendingUpload) {
    upload.error = '';
    upload.pending = true;
    upload.progress = 0;
    const data = new FormData();
    data.set('file', upload.file);
    const xhr = new XMLHttpRequest();
    upload.xhr = xhr;
    xhr.open('POST', '/admin/upload');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) upload.progress = Math.round((event.loaded / event.total) * 100);
    };
    xhr.onload = () => {
      upload.pending = false;
      let result;
      try {
        result = JSON.parse(xhr.responseText);
      } catch {
        result = { error: 'Resposta inesperada. Tente novamente.' };
      }
      if (xhr.status >= 200 && xhr.status < 300 && result.id) {
        photos.push(result);
        uploads = uploads.filter((u) => u.key !== upload.key);
        URL.revokeObjectURL(upload.preview);
      } else upload.error = result.error || 'Não foi possível enviar esta foto.';
    };
    xhr.onerror = () => {
      upload.pending = false;
      upload.error = 'Falha de conexão. Toque para tentar novamente.';
    };
    xhr.send(data);
  }
  function add(event: Event) {
    const files = Array.from((event.target as HTMLInputElement).files ?? []);
    error = '';
    for (const file of files) {
      if (photos.length + uploads.length >= max) {
        error = `Você pode escolher até ${max} foto${max === 1 ? '' : 's'}.`;
        break;
      }
      if (file.size > 15 * 1024 * 1024) {
        error = `${file.name}: o limite é 15 MB por foto.`;
        continue;
      }
      const key = `upload-${++uploadCounter}`;
      uploads.push({ key, file, preview: URL.createObjectURL(file), progress: 0, pending: true });
      send(uploads.find((u) => u.key === key)!);
    }
    input.value = '';
  }
  function move(i: number, offset: number) {
    const next = [...photos];
    [next[i], next[i + offset]] = [next[i + offset]!, next[i]!];
    photos = next;
  }
  function dismiss(upload: PendingUpload) {
    upload.xhr?.abort();
    URL.revokeObjectURL(upload.preview);
    uploads = uploads.filter((u) => u.key !== upload.key);
  }
  onDestroy(() => {
    uploads.forEach((u) => {
      u.xhr?.abort();
      URL.revokeObjectURL(u.preview);
    });
  });
</script>

<input type="hidden" {name} value={JSON.stringify(photos.map((p) => p.id))} />
<div class="upload-area">
  <label class="upload-label"
    ><Upload size={25} strokeWidth={1.3} /><strong>Escolher fotos</strong><span
      >Do celular ou computador · até 15 MB por foto</span
    ><input
      bind:this={input}
      type="file"
      accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
      multiple={max > 1}
      onchange={add}
      aria-label="Escolher fotos"
      disabled={!ready || photos.length + uploads.length >= max}
    /></label
  >
</div>
{#if error}<p class="form-error" role="alert">{error}</p>{/if}
<div class="upload-grid">
  {#each photos as photo, i (photo.id)}<div class="upload-photo">
      <img src={photo.url} alt={`Foto ${i + 1}`} /><span class="photo-index"
        >{i === 0 ? 'Capa' : `Foto ${i + 1}`}</span
      >
      <div class="photo-controls">
        <button
          type="button"
          aria-label={`Mover foto ${i + 1} para antes`}
          onclick={() => move(i, -1)}
          disabled={i === 0}><ArrowUp size={15} /></button
        ><button
          type="button"
          aria-label={`Mover foto ${i + 1} para depois`}
          onclick={() => move(i, 1)}
          disabled={i === photos.length - 1}><ArrowDown size={15} /></button
        ><button
          type="button"
          aria-label={`Remover foto ${i + 1}`}
          onclick={() => (photos = photos.filter((p) => p.id !== photo.id))}><X size={15} /></button
        >
      </div>
    </div>{/each}{#each uploads as upload (upload.key)}<div class="upload-photo pending">
      <img src={upload.preview} alt="Foto aguardando envio" /><button
        type="button"
        class="remove-upload"
        aria-label="Cancelar envio"
        onclick={() => dismiss(upload)}><X size={15} /></button
      >{#if upload.error}<div class="upload-status">
          <p role="alert">{upload.error}</p>
          <button type="button" class="text-link" onclick={() => send(upload)}
            ><RotateCcw size={15} />Tentar novamente</button
          >
        </div>{:else}<div class="upload-status">
          <span>{upload.progress < 100 ? `Enviando ${upload.progress}%` : 'Preparando foto…'}</span
          ><progress max="100" value={upload.progress}></progress>
        </div>{/if}
    </div>{/each}
</div>
<p class="field-hint">
  {max > 1
    ? 'A primeira foto é a capa. Use as setas para reorganizar.'
    : 'A foto aparecerá na seção Nossa história.'}
</p>
