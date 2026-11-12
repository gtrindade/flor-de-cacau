<script module lang="ts">
  export type UploadPhoto = {
    key: string;
    id: string;
    url: string;
    alt?: string;
    file?: File;
    progress?: number;
    error?: string;
    xhr?: XMLHttpRequest;
  };
</script>

<script lang="ts">
  import Upload from '@lucide/svelte/icons/upload';
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import X from '@lucide/svelte/icons/x';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import { onDestroy, onMount, untrack, type Snippet } from 'svelte';
  type Photo = { id: string; url: string; alt?: string };
  let {
    initial = [],
    name = 'mediaIds',
    max = 8,
    busy = $bindable(false),
    photos = $bindable<UploadPhoto[]>(
      untrack(() => initial.map((photo) => ({ ...photo, key: photo.id })))
    ),
    details
  }: {
    initial?: Photo[];
    name?: string;
    max?: number | null;
    busy?: boolean;
    photos?: UploadPhoto[];
    details?: Snippet<[UploadPhoto, number]>;
  } = $props();
  let ready = $state(false);
  let input: HTMLInputElement;
  let error = $state('');
  let uploadCounter = 0;
  let activeUploads = 0;
  let destroyed = false;
  onMount(() => {
    ready = true;
  });
  $effect(() => {
    busy = photos.some((photo) => !photo.id || !!photo.error);
  });
  function pump() {
    if (destroyed) return;
    for (const photo of photos) {
      if (activeUploads >= 2) break;
      if (photo.file && !photo.id && !photo.xhr && !photo.error) send(photo);
    }
  }
  function send(photo: UploadPhoto) {
    if (!photo.file) return;
    photo.progress = 0;
    const data = new FormData();
    data.set('file', photo.file);
    const xhr = new XMLHttpRequest();
    photo.xhr = xhr;
    activeUploads++;
    let settled = false;
    const complete = () => {
      if (settled) return;
      settled = true;
      activeUploads--;
      photo.xhr = undefined;
      pump();
    };
    xhr.open('POST', '/admin/upload');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) photo.progress = Math.round((event.loaded / event.total) * 100);
    };
    xhr.onload = () => {
      let result;
      try {
        result = JSON.parse(xhr.responseText);
      } catch {
        result = { error: 'Resposta inesperada. Tente novamente.' };
      }
      if (
        xhr.status >= 200 &&
        xhr.status < 300 &&
        typeof result.id === 'string' &&
        typeof result.url === 'string'
      ) {
        const preview = photo.url;
        photo.id = result.id;
        photo.url = result.url;
        photo.file = undefined;
        URL.revokeObjectURL(preview);
      } else photo.error = result.error || 'Não foi possível enviar esta foto.';
      complete();
    };
    xhr.onerror = () => {
      photo.error = 'Falha de conexão. Toque para tentar novamente.';
      complete();
    };
    xhr.onabort = complete;
    xhr.send(data);
  }
  function add(event: Event) {
    const files = Array.from((event.target as HTMLInputElement).files ?? []);
    error = '';
    for (const file of files) {
      if (max !== null && photos.length >= max) {
        error = `Você pode escolher até ${max} foto${max === 1 ? '' : 's'}.`;
        break;
      }
      if (file.size > 15 * 1024 * 1024) {
        error = `${file.name}: o limite é 15 MB por foto.`;
        continue;
      }
      photos.push({
        key: `upload-${++uploadCounter}`,
        id: '',
        file,
        url: URL.createObjectURL(file),
        progress: 0
      });
    }
    input.value = '';
    pump();
  }
  function move(index: number, offset: number) {
    const next = [...photos];
    [next[index], next[index + offset]] = [next[index + offset]!, next[index]!];
    photos = next;
  }
  function remove(photo: UploadPhoto) {
    photos = photos.filter((item) => item.key !== photo.key);
    photo.xhr?.abort();
    if (photo.file) URL.revokeObjectURL(photo.url);
    pump();
  }
  function retry(photo: UploadPhoto) {
    photo.error = undefined;
    pump();
  }
  onDestroy(() => {
    destroyed = true;
    for (const photo of photos) {
      photo.xhr?.abort();
      if (photo.file) URL.revokeObjectURL(photo.url);
    }
  });
</script>

<input
  type="hidden"
  {name}
  value={JSON.stringify(photos.filter((photo) => photo.id).map((photo) => photo.id))}
/>
<div class="upload-area">
  <label class="upload-label">
    <Upload size={25} strokeWidth={1.3} /><strong>Escolher fotos</strong>
    <span>Do celular ou computador · até 15 MB por foto</span>
    <input
      bind:this={input}
      type="file"
      accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
      multiple={max === null || max > 1}
      onchange={add}
      aria-label="Escolher fotos"
      disabled={!ready || (max !== null && photos.length >= max)}
    />
  </label>
</div>
{#if error}<p class="form-error" role="alert">{error}</p>{/if}
<div class="upload-grid" class:upload-option-list={!!details}>
  {#each photos as photo, index (photo.key)}
    <div class="upload-item" data-testid={details ? 'photo-option-editor' : undefined}>
      <div class="upload-photo" class:pending={!photo.id}>
        <img
          src={photo.url}
          alt={photo.id ? `Foto ${index + 1}` : 'Foto aguardando envio'}
          loading="lazy"
        />
        {#if photo.id}
          <span class="photo-index">{index === 0 ? 'Capa' : `Foto ${index + 1}`}</span>
          <div class="photo-controls">
            <button
              type="button"
              aria-label={`Mover foto ${index + 1} para antes`}
              onclick={() => move(index, -1)}
              disabled={index === 0}><ArrowUp size={15} /></button
            >
            <button
              type="button"
              aria-label={`Mover foto ${index + 1} para depois`}
              onclick={() => move(index, 1)}
              disabled={index === photos.length - 1}><ArrowDown size={15} /></button
            >
            <button
              type="button"
              aria-label={`Remover foto ${index + 1}`}
              onclick={() => remove(photo)}><X size={15} /></button
            >
          </div>
        {:else}
          <button
            type="button"
            class="remove-upload"
            aria-label="Cancelar envio"
            onclick={() => remove(photo)}><X size={15} /></button
          >
          <div class="upload-status">
            {#if photo.error}
              <p role="alert">{photo.error}</p>
              <button type="button" class="text-link" onclick={() => retry(photo)}
                ><RotateCcw size={15} />Tentar novamente</button
              >
            {:else}
              <span
                >{!photo.xhr
                  ? 'Na fila para envio…'
                  : (photo.progress ?? 0) < 100
                    ? `Enviando ${photo.progress ?? 0}%`
                    : 'Preparando foto…'}</span
              >
              <progress max="100" value={photo.progress ?? 0}></progress>
            {/if}
          </div>
        {/if}
      </div>
      {#if details}{@render details(photo, index)}{/if}
    </div>
  {/each}
</div>
<p class="field-hint">
  {max === 1
    ? 'A foto aparecerá na seção Nossa história.'
    : 'A primeira foto é a capa. Use as setas para reorganizar.'}
</p>
