
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import { v4 as uuid } from 'uuid';

import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand
} from '@aws-sdk/client-s3';

import {
  PutCommand,
  ScanCommand,
  DeleteCommand,
  UpdateCommand
} from '@aws-sdk/lib-dynamodb';

import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { awsEnabled, bucket, table, s3, ddb } from './aws.js';

dotenv.config();

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  req.userId = req.header('x-user-id') || 'demo-user';
  next();
});

const localFiles = new Map();
const localFolders = new Map();

const safeName = (name = 'file') =>
  name.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 120);

const getUserItems = async (userId) => {
  if (awsEnabled) {
    const result = await ddb.send(new ScanCommand({
      TableName: table,
      FilterExpression: 'userId = :u',
      ExpressionAttributeValues: { ':u': userId }
    }));

    return result.Items || [];
  }

  return [
    ...[...localFiles.values()].filter(x => x.userId === userId),
    ...[...localFolders.values()].filter(x => x.userId === userId)
  ];
};

const findFolder = async (id, userId) => {
  if (!id) return null;

  const items = await getUserItems(userId);
  return items.find(x =>
    x.id === id &&
    x.userId === userId &&
    x.entityType === 'folder'
  );
};

const saveItem = async (item) => {
  if (awsEnabled) {
    await ddb.send(new PutCommand({
      TableName: table,
      Item: item
    }));
  } else if (item.entityType === 'folder') {
    localFolders.set(item.id, item);
  } else {
    localFiles.set(item.id, item);
  }
};

app.get('/', (req, res) => {
  res.json({
    message: 'CloudBox Backend is Running Successfully!',
    status: 'OK'
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    mode: awsEnabled ? 'aws' : 'local',
    services: awsEnabled
      ? ['S3', 'DynamoDB']
      : ['Local demo storage']
  });
});

// GET FILES IN A FOLDER
app.get('/api/files', async (req, res) => {
  try {
    const { folderId } = req.query;
    const items = await getUserItems(req.userId);

    const files = items.filter(f =>
      f.entityType !== 'folder' &&
      (f.folderId || null) === (folderId || null)
    );

    files.sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );

    res.json(files);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// CREATE FOLDER
app.post('/api/folders', async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    const parentFolderId = req.body.parentFolderId || null;

    if (!name) {
      return res.status(400).json({
        error: 'Folder name is required'
      });
    }

    if (name.length > 80) {
      return res.status(400).json({
        error: 'Folder name must be 80 characters or less'
      });
    }

    if (parentFolderId) {
      const parent = await findFolder(parentFolderId, req.userId);
      if (!parent) {
        return res.status(404).json({
          error: 'Parent folder not found'
        });
      }
    }

    const items = await getUserItems(req.userId);

    const duplicate = items.some(item =>
      item.entityType === 'folder' &&
      item.parentFolderId === parentFolderId &&
      item.name.toLowerCase() === name.toLowerCase()
    );

    if (duplicate) {
      return res.status(409).json({
        error: 'A folder with this name already exists'
      });
    }

    const folder = {
      id: uuid(),
      userId: req.userId,
      name,
      entityType: 'folder',
      parentFolderId,
      createdAt: new Date().toISOString()
    };

    await saveItem(folder);

    res.status(201).json(folder);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET FOLDERS
app.get('/api/folders', async (req, res) => {
  try {
    const parentFolderId = req.query.parentFolderId || null;
    const items = await getUserItems(req.userId);

    const folders = items.filter(folder =>
      folder.entityType === 'folder' &&
      (folder.parentFolderId || null) === parentFolderId
    );

    folders.sort((a, b) => a.name.localeCompare(b.name));

    res.json(folders);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// RENAME FOLDER
app.patch('/api/folders/:id', async (req, res) => {
  try {
    const name = (req.body.name || '').trim();

    if (!name || name.length > 80) {
      return res.status(400).json({
        error: 'Enter a valid folder name (maximum 80 characters)'
      });
    }

    const folder = await findFolder(req.params.id, req.userId);

    if (!folder) {
      return res.status(404).json({
        error: 'Folder not found'
      });
    }

    const items = await getUserItems(req.userId);

    const duplicate = items.some(item =>
      item.entityType === 'folder' &&
      item.id !== folder.id &&
      (item.parentFolderId || null) === (folder.parentFolderId || null) &&
      item.name.toLowerCase() === name.toLowerCase()
    );

    if (duplicate) {
      return res.status(409).json({
        error: 'A folder with this name already exists'
      });
    }

    if (awsEnabled) {
      await ddb.send(new UpdateCommand({
        TableName: table,
        Key: { id: folder.id },
        UpdateExpression: 'SET #n = :n',
        ConditionExpression: 'userId = :u',
        ExpressionAttributeNames: { '#n': 'name' },
        ExpressionAttributeValues: {
          ':n': name,
          ':u': req.userId
        }
      }));
    } else {
      folder.name = name;
      localFolders.set(folder.id, folder);
    }

    res.json({
      message: 'Folder renamed successfully',
      id: folder.id,
      name
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE EMPTY FOLDER
app.delete('/api/folders/:id', async (req, res) => {
  try {
    const folder = await findFolder(req.params.id, req.userId);

    if (!folder) {
      return res.status(404).json({
        error: 'Folder not found'
      });
    }

    const items = await getUserItems(req.userId);

    const hasContents = items.some(item =>
      item.id !== folder.id &&
      (
        item.folderId === folder.id ||
        item.parentFolderId === folder.id
      )
    );

    if (hasContents) {
      return res.status(409).json({
        error: 'Folder is not empty. Delete its contents first.'
      });
    }

    if (awsEnabled) {
      await ddb.send(new DeleteCommand({
        TableName: table,
        Key: { id: folder.id },
        ConditionExpression: 'userId = :u',
        ExpressionAttributeValues: {
          ':u': req.userId
        }
      }));
    } else {
      localFolders.delete(folder.id);
    }

    res.json({ message: 'Folder deleted successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// UPLOAD FILE
app.post('/api/files', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'Choose a file first'
      });
    }

    const folderId = req.body.folderId || null;

    if (folderId) {
      const folder = await findFolder(folderId, req.userId);
      if (!folder) {
        return res.status(404).json({
          error: 'Folder not found'
        });
      }
    }

    const id = uuid();
    const key = `${req.userId}/${id}-${safeName(req.file.originalname)}`;

    const item = {
      id,
      userId: req.userId,
      name: req.file.originalname,
      key,
      size: req.file.size,
      type: req.file.mimetype,
      entityType: 'file',
      folderId,
      createdAt: new Date().toISOString()
    };

    if (awsEnabled) {
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
        ServerSideEncryption: 'aws:kms'
      }));

      await ddb.send(new PutCommand({
        TableName: table,
        Item: item
      }));
    } else {
      item.data = req.file.buffer.toString('base64');
      localFiles.set(id, item);
    }

    const { data, ...publicItem } = item;
    res.status(201).json(publicItem);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DOWNLOAD FILE
app.get('/api/files/:id/download', async (req, res) => {
  try {
    const items = await getUserItems(req.userId);

    const item = items.find(f =>
      f.id === req.params.id &&
      f.entityType !== 'folder'
    );

    if (!item) {
      return res.status(404).json({
        error: 'File not found'
      });
    }

    if (awsEnabled) {
      const url = await getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: bucket,
          Key: item.key,
          ResponseContentDisposition:
            `attachment; filename="${safeName(item.name)}"`
        }),
        { expiresIn: 300 }
      );

      return res.json({ url });
    }

    res.json({
      data: item.data,
      name: item.name,
      type: item.type
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE FILE
app.delete('/api/files/:id', async (req, res) => {
  try {
    const items = await getUserItems(req.userId);

    const item = items.find(f =>
      f.id === req.params.id &&
      f.entityType !== 'folder'
    );

    if (!item) {
      return res.status(404).json({
        error: 'File not found'
      });
    }

    if (awsEnabled) {
      await s3.send(new DeleteObjectCommand({
        Bucket: bucket,
        Key: item.key
      }));

      await ddb.send(new DeleteCommand({
        TableName: table,
        Key: { id: item.id },
        ConditionExpression: 'userId = :u',
        ExpressionAttributeValues: {
          ':u': req.userId
        }
      }));
    } else {
      localFiles.delete(item.id);
    }

    res.json({ message: 'File deleted' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const port = process.env.PORT || 5000;

app.listen(port, () => {
  console.log(
    `CloudBox API running at http://localhost:${port} (${awsEnabled ? 'AWS' : 'local'} mode)`
  );
});
