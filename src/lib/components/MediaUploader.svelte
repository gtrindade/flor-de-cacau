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
    preparing?: boolean;
    prepared?: boolean;
    pickerId?: number;
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
  let pickerCounter = $state(0);
  let pickers = $state([0]);
  let error = $state('');
  let uploadCounter = 0;
  let activeUploads = 0;
  let pausedPhotoKey = $state<string | null>(null);
  let destroyed = false;
  onMount(() => {
    ready = true;
  });
  $effect(() => {
    busy = photos.some((photo) => !photo.id || !!photo.error);
  });
  function pump() {
    if (destroyed || activeUploads || pausedPhotoKey) return;
    const next = photos.find((photo) => photo.file && !photo.id && !photo.error);
    if (next) void send(next);
  }
  function releasePickers() {
    // Keep each native selection attached until its files have independent byte copies.
    // Selecting another batch must not clear files still waiting in the upload queue.
    pickers = pickers.filter(
      (picker) =>
        picker === pickerCounter ||
        photos.some((photo) => photo.pickerId === picker && photo.file && !photo.prepared)
    );
  }
  async function send(photo: UploadPhoto) {
    if (!photo.file) return;
    activeUploads++;
    photo.preparing = true;
    photo.progress = 0;
    try {
      if (!photo.prepared) {
        const original = photo.file;
        const bytes = await original.arrayBuffer();
        if (destroyed || !photos.includes(photo)) return;
        if (!bytes.byteLength) throw new Error('Empty photo');
        photo.file = new File([bytes], original.name, {
          type: original.type,
          lastModified: original.lastModified
        });
        photo.prepared = true;
        const preview = photo.url;
        photo.url = URL.createObjectURL(photo.file);
        URL.revokeObjectURL(preview);
        releasePickers();
      }
      photo.preparing = false;
      await transmit(photo);
    } catch {
      if (!destroyed && photos.includes(photo))
        photo.error = 'Não conseguimos ler esta foto. Selecione-a novamente no celular.';
    } finally {
      photo.preparing = false;
      photo.xhr = undefined;
      activeUploads--;
      pump();
    }
  }
  function transmit(photo: UploadPhoto) {
    return new Promise<void>((resolve) => {
      const data = new FormData();
      data.set('file', photo.file!);
      const xhr = new XMLHttpRequest();
      photo.xhr = xhr;
      xhr.open('POST', '/admin/upload');
      xhr.timeout = 120_000;
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
          typeof result?.id === 'string' &&
          typeof result?.url === 'string'
        ) {
          const preview = photo.url;
          photo.id = result.id;
          photo.url = result.url;
          photo.file = undefined;
          URL.revokeObjectURL(preview);
        } else photo.error = result?.error || 'Não foi possível enviar esta foto.';
        resolve();
      };
      xhr.onerror = () => {
        photo.error = 'Falha de conexão. Toque para tentar novamente.';
        pausedPhotoKey = photo.key;
        resolve();
      };
      xhr.ontimeout = () => {
        photo.error = 'O envio demorou demais. Confira a conexão e tente novamente.';
        pausedPhotoKey = photo.key;
        resolve();
      };
      xhr.onabort = () => resolve();
      xhr.send(data);
    });
  }
  function add(event: Event, pickerId: number) {
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
        pickerId,
        url: URL.createObjectURL(file),
        progress: 0
      });
    }
    // A fresh input allows more batches (including the same photo) without invalidating this one.
    pickers.push(++pickerCounter);
    releasePickers();
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
    if (pausedPhotoKey === photo.key) pausedPhotoKey = null;
    releasePickers();
    pump();
  }
  function retry(photo: UploadPhoto) {
    photo.error = undefined;
    if (pausedPhotoKey === photo.key) pausedPhotoKey = null;
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
  {#each pickers as picker (picker)}
    <label class="upload-label" style={picker === pickerCounter ? undefined : 'display: none'}>
      {#if picker === pickerCounter}
        <Upload size={25} strokeWidth={1.3} /><strong>Escolher fotos</strong>
        <span>Do celular ou computador · até 15 MB por foto</span>
      {/if}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
        multiple={max === null || max > 1}
        onchange={(event) => add(event, picker)}
        aria-label={picker === pickerCounter ? 'Escolher fotos' : undefined}
        disabled={!ready || (max !== null && photos.length >= max)}
      />
    </label>
  {/each}
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
                >{photo.preparing
                  ? 'Lendo foto…'
                  : !photo.xhr
                    ? pausedPhotoKey
                      ? 'Aguardando nova tentativa…'
                      : 'Na fila para envio…'
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
