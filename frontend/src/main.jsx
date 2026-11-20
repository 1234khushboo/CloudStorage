
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Cloud, Upload, Search, Grid2X2, List, File, FileText,
  Image as ImageIcon, FileArchive, Download, Trash2,
  HardDrive, Folder, FolderPlus, FolderOpen, ShieldCheck,
  X, ChevronRight, ArrowLeft, Pencil
} from 'lucide-react';
import './style.css';

const API = 'http://localhost:5000/api';

function App() {
  const [files, setFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [currentFolder, setCurrentFolder] = useState(null);
  const [query, setQuery] = useState('');
  const [view, setView] = useState('grid');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [mode, setMode] = useState('local');
const [previewUrl, setPreviewUrl] = useState('');
const [previewName, setPreviewName] = useState('');
  const folderId = currentFolder?.id || '';

  const load = async () => {
    try {
      const health = await fetch(API + '/health').then(r => r.json());
      setMode(health.mode);

      const fileUrl = new URL(API + '/files');
      const folderUrl = new URL(API + '/folders');

      if (folderId) {
        fileUrl.searchParams.set('folderId', folderId);
        folderUrl.searchParams.set('parentFolderId', folderId);
      }

      const [fileResponse, folderResponse] = await Promise.all([
        fetch(fileUrl),
        fetch(folderUrl)
      ]);

      const [fileData, folderData] = await Promise.all([
        fileResponse.json(),
        folderResponse.json()
      ]);

      if (!fileResponse.ok) throw Error(fileData.error);
      if (!folderResponse.ok) throw Error(folderData.error);

      setFiles(fileData);
      setFolders(folderData);
    } catch (e) {
      setNotice('Backend error: ' + e.message);
    }
  };

  useEffect(() => {
    load();
  }, [folderId]);

  const filtered = useMemo(
    () => files.filter(f =>
      f.name.toLowerCase().includes(query.toLowerCase())
    ),
    [files, query]
  );

  const filteredFolders = useMemo(
    () => folders.filter(f =>
      f.name.toLowerCase().includes(query.toLowerCase())
    ),
    [folders, query]
  );

  const total = files.reduce((n, f) => n + (f.size || 0), 0);

  const fmt = n =>
    n < 1024
      ? `${n} B`
      : n < 1048576
        ? `${(n / 1024).toFixed(1)} KB`
        : `${(n / 1048576).toFixed(1)} MB`;

  // CREATE FOLDER
  const createFolder = async () => {
    const name = prompt('Enter folder name:');

    if (!name?.trim()) return;

    try {
      const response = await fetch(API + '/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          parentFolderId: folderId || null
        })
      });

      const data = await response.json();

      if (!response.ok) throw Error(data.error);

      await load();
      setNotice('Folder created successfully!');
    } catch (e) {
      setNotice(e.message);
    }
  };

  // OPEN FOLDER
  const openFolder = folder => {
    setCurrentFolder(folder);
    setQuery('');
  };

  // GO BACK TO ROOT
  const goHome = () => {
    setCurrentFolder(null);
    setQuery('');
  };

  // RENAME FOLDER
  const renameFolder = async folder => {
    const name = prompt('Enter new folder name:', folder.name);

    if (!name?.trim() || name.trim() === folder.name) return;

    try {
      const response = await fetch(`${API}/folders/${folder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() })
      });

      const data = await response.json();

      if (!response.ok) throw Error(data.error);

      await load();
      setNotice('Folder renamed successfully!');
    } catch (e) {
      setNotice(e.message);
    }
  };

  // DELETE FOLDER
  const deleteFolder = async folder => {
    if (!confirm(`Delete folder "${folder.name}"?`)) return;

    try {
      const response = await fetch(`${API}/folders/${folder.id}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (!response.ok) throw Error(data.error);

      await load();
      setNotice('Folder deleted successfully!');
    } catch (e) {
      setNotice(e.message);
    }
  };
// PREVIEW PDF
const previewPDF = async file => {
  try {
    const response = await fetch(
      `${API}/files/${file.id}/download`
    );

    const data = await response.json();

    if (!response.ok) throw Error(data.error || 'Preview failed');

    let url;

    if (data.url) {
      url = data.url;
    } else {
      const binary = atob(data.data);
      const bytes = new Uint8Array(binary.length);

      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const blob = new Blob([bytes], {
        type: data.type || 'application/pdf'
      });

      url = URL.createObjectURL(blob);
    }

    setPreviewName(data.name || file.name);
    setPreviewUrl(url);

  } catch (e) {
    setNotice(e.message);
  }
};

const closePreview = () => {
  if (previewUrl.startsWith('blob:')) {
    URL.revokeObjectURL(previewUrl);
  }

  setPreviewUrl('');
  setPreviewName('');
};
  // UPLOAD FILE
  const upload = async e => {
    const selected = [...e.target.files];

    if (!selected.length) return;

    setBusy(true);
    setNotice('');

    try {
      for (const file of selected) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('folderId', folderId);

        const response = await fetch(API + '/files', {
          method: 'POST',
          body: fd
        });

        const data = await response.json();

        if (!response.ok) throw Error(data.error || 'Upload failed');
      }

      await load();
      setNotice(`${selected.length} file(s) uploaded successfully`);
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  // DOWNLOAD FILE
  const download = async file => {
    try {
      const response = await fetch(
        `${API}/files/${file.id}/download`
      );

      const data = await response.json();

      if (!response.ok) throw Error(data.error);

      if (data.url) {
        window.open(data.url, '_blank', 'noopener');
      } else {
        const a = document.createElement('a');
        a.href = `data:${data.type};base64,${data.data}`;
        a.download = data.name;
        a.click();
      }
    } catch (e) {
      setNotice(e.message);
    }
  };

  // DELETE FILE
  const remove = async file => {
    if (!confirm(`Delete ${file.name}?`)) return;

    try {
      const response = await fetch(`${API}/files/${file.id}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (!response.ok) throw Error(data.error);

      await load();
      setNotice('File deleted');
    } catch (e) {
      setNotice(e.message);
    }
  };

  const icon = file =>
    file.type?.startsWith('image/')
      ? <ImageIcon />
      : file.type?.includes('pdf') || file.type?.includes('text')
        ? <FileText />
        : file.type?.includes('zip')
          ? <FileArchive />
          : <File />;

  return (
    <div className="app">

      <aside className="sidebar">

        <div className="brand">
          <span className="brand-icon"><Cloud /></span>
          <b>CloudBox</b>
        </div>

        <button
          className="upload-btn"
          onClick={() => document.getElementById('fileInput').click()}
        >
          <Upload size={18} /> Upload files
        </button>

        <input
          id="fileInput"
          type="file"
          multiple
          hidden
          onChange={upload}
        />

        <nav>
          <a
            className={!currentFolder ? 'active' : ''}
            onClick={goHome}
          >
            <Grid2X2 /> My Drive
          </a>

          <a>
            <Folder /> Shared with me
          </a>

          <a>
            ☆ Starred
          </a>

          <a>
            <Trash2 /> Trash
          </a>
        </nav>

        <div className="storage">
          <div className="storage-title">
            <HardDrive size={17} /> Storage
          </div>

          <div className="bar">
            <span style={{
              width: `${Math.min(total / 100000000 * 100, 100)}%`
            }} />
          </div>

          <small>{fmt(total)} used in this demo</small>
          <p>Storage usage updates as you add files.</p>
        </div>

        <div className="side-bottom">
          <ShieldCheck size={16} />
          Secure cloud workspace
        </div>

      </aside>

      <main className="main">

        <header>
          <div className="crumb">
            <span className="breadcrumb-home" onClick={goHome}>
              My Drive
            </span>

            {currentFolder && (
              <>
                <ChevronRight size={14} />
                {currentFolder.name}
              </>
            )}
          </div>

          <div className="profile">
            <span className="mode">
              {mode === 'aws' ? 'AWS connected' : 'Local demo'}
            </span>
            <div className="avatar">U</div>
          </div>
        </header>

        <section className="welcome">
          <div>
            <p className="eyebrow">YOUR PERSONAL CLOUD</p>

            <h1>
              All your files, <em>one place.</em>
            </h1>

            <p className="sub">
              Store, organize and access your files from anywhere.
            </p>
          </div>

          <div className="cloud-art">
            <Cloud size={74} />
            <span>☁</span>
          </div>
        </section>

        {notice && (
          <div className="notice">
            {notice}
            <button onClick={() => setNotice('')}>
              <X size={15} />
            </button>
          </div>
        )}

        <section className="toolbar">

          <div>
            <h2>
              {currentFolder ? currentFolder.name : 'My files'}
              <span>{folders.length + files.length}</span>
            </h2>

            <p>Manage your uploaded documents and media</p>
          </div>

          <div className="actions">

            <button className="new-folder-btn" onClick={createFolder}>
              <FolderPlus size={17} />
              New Folder
            </button>

            <label className="search">
              <Search size={17} />

              <input
                placeholder="Search files..."
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </label>

            <button
              className={view === 'grid' ? 'view active-view' : 'view'}
              onClick={() => setView('grid')}
            >
              <Grid2X2 size={17} />
            </button>

            <button
              className={view === 'list' ? 'view active-view' : 'view'}
              onClick={() => setView('list')}
            >
              <List size={18} />
            </button>

          </div>
        </section>

        {currentFolder && (
          <button className="back-folder" onClick={goHome}>
            <ArrowLeft size={16} /> Back to My Drive
          </button>
        )}

        {busy && (
          <div className="loading">Uploading your files…</div>
        )}

        {filteredFolders.length === 0 && filtered.length === 0 ? (

          <div className="empty">
            <div className="empty-icon">
              <Cloud size={36} />
            </div>

            <h3>
              {query ? 'No matching files' : 'This folder is empty'}
            </h3>

            <p>
              {query
                ? 'Try another search term.'
                : 'Create a folder or upload your first file.'}
            </p>

            <div className="empty-buttons">
              <button className="upload-btn" onClick={createFolder}>
                <FolderPlus size={17} /> New Folder
              </button>

              <button
                className="upload-btn"
                onClick={() => document.getElementById('fileInput').click()}
              >
                <Upload size={17} /> Upload files
              </button>
            </div>
          </div>

        ) : (

          <div className={view === 'grid' ? 'file-grid' : 'file-list'}>

            {filteredFolders.map(folder => (
              <article className="file-card folder-card" key={folder.id}>

                <div
                  className="file-preview folder-preview"
                  onClick={() => openFolder(folder)}
                >
                  <div className="folder-icon">
                    <FolderOpen size={36} />
                  </div>
                </div>

                <div className="file-info">
                  <div
                    className="file-name folder-name"
                    title={folder.name}
                    onClick={() => openFolder(folder)}
                  >
                    {folder.name}
                  </div>

                  <div className="file-meta">Folder</div>
                </div>

                <div className="file-actions">
                  <button
                    title="Open folder"
                    onClick={() => openFolder(folder)}
                  >
                    <FolderOpen size={16} />
                  </button>

                  <button
                    title="Rename folder"
                    onClick={() => renameFolder(folder)}
                  >
                    <Pencil size={16} />
                  </button>

                  <button
                    title="Delete folder"
                    onClick={() => deleteFolder(folder)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

              </article>
            ))}

            {filtered.map(file => (
              <article className="file-card" key={file.id}>

                <div className="file-preview">
                  <div className="file-type">{icon(file)}</div>
                </div>

                <div className="file-info">
                  <div className="file-name" title={file.name}>
                    {file.name}
                  </div>

                  <div className="file-meta">
                    {fmt(file.size)}
                    <span>•</span>
                    {new Date(file.createdAt).toLocaleDateString()}
                  </div>
                </div>

                <div className="file-actions">

  {(
    file.type?.includes('pdf') ||
    file.name.toLowerCase().endsWith('.pdf')
  ) && (
    <button
      title="Preview PDF"
      onClick={() => previewPDF(file)}
    >
      <FileText size={16} />
    </button>
  )}

  <button
    title="Download"
    onClick={() => download(file)}
  >
    <Download size={16} />
  </button>
                  <button
                    title="Delete"
                    onClick={() => remove(file)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

              </article>
            ))}

          </div>
        )}
{previewUrl && (
  <div className="pdf-modal">
    <div className="pdf-modal-content">

      <div className="pdf-modal-header">
        <h3>{previewName}</h3>

        <button onClick={closePreview}>
          <X size={20} />
        </button>
      </div>

      <iframe
        src={previewUrl}
        title="PDF Preview"
        className="pdf-viewer"
      />

    </div>
  </div>
)}
        <footer>
          CloudBox · Built with React, Node.js and AWS
          <span>Secure file management</span>
        </footer>

      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
