# CloudBox – AWS Cloud Storage Clone

A beginner-friendly Google Drive-style file manager built with React + Vite, Node.js + Express, Amazon S3 and DynamoDB. It supports multiple file uploads, listing, downloads, deletion, search, storage usage and a responsive dashboard.

## 1. Run locally (no AWS account required)

Requirements: Node.js 18+ and npm.

```bash
# from the project root
npm install
npm run install:all
```

Copy `backend/.env.example` to `backend/.env` (keep `AWS_MODE=local`), then run:

```bash
npm run dev
```

Open http://localhost:5173. The API runs at http://localhost:5000. Local demo files are held in backend memory and disappear when the backend restarts.

## 2. Connect Amazon S3 + DynamoDB

1. Create an S3 bucket in your chosen region (for example `ap-south-1`). Keep Block Public Access enabled. Enable versioning if you want file recovery.
2. Create a DynamoDB table named `CloudBoxFiles` with partition key `id` (String).
3. Create an IAM role/user for the backend with only the required permissions: `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on your bucket and `dynamodb:PutItem`, `dynamodb:Scan`, `dynamodb:DeleteItem` on your table. Add KMS permissions if using a customer-managed key.
4. Copy `backend/.env.example` to `backend/.env` and set `AWS_MODE=aws`, `AWS_REGION`, `S3_BUCKET`, and `DYNAMODB_TABLE`.
5. Configure AWS credentials using an IAM role on EC2/ECS/Lambda (recommended) or the AWS CLI profile locally. Do not put access keys in frontend code or commit them.
6. Restart the backend and upload a test file. Files go to S3; metadata goes to DynamoDB.

The backend uses S3 server-side encryption with AWS KMS (`aws:kms`). If you use the AWS-managed S3 key or a customer-managed key, ensure the IAM principal has the corresponding KMS permissions.

## 3. AWS services roadmap

| Service | How it fits | Status |
|---|---|---|
| Amazon S3 | Object storage | Implemented |
| IAM | Least-privilege access for backend | Configure in AWS |
| DynamoDB | File metadata | Implemented |
| AWS KMS | S3 object encryption | Implemented request setting; configure key permissions |
| Amazon Cognito | Real user sign-up/sign-in and JWT validation | Next integration |
| API Gateway + Lambda | Serverless API alternative to Express | Deployment option |
| CloudFront | CDN for downloads | Deployment option |
| CloudWatch | Logs, metrics and alarms | Configure on deployment |
| S3 Lifecycle | Transition old objects to cheaper storage / expire old versions | Configure bucket lifecycle rule |
| SNS | Upload / quota notifications | Next integration |

## 4. Important security notes

- This starter uses a demo `x-user-id` header, not real authentication. Anyone who can reach the demo API could impersonate another demo user. Do not expose it publicly.
- Before production, integrate Cognito and verify JWTs on every API request. Derive the user ID from the verified token, never from a request header.
- For a production design, replace DynamoDB scans with a table keyed by `userId` (partition key) and `createdAt`/`id` (sort key), and query only the signed-in user's partition.
- Use private S3 buckets, Block Public Access, least-privilege IAM, TLS, file size/type validation, malware scanning, rate limiting, and audit logging.
- Local demo mode is in-memory, limited to 50 MB per file, and not durable. AWS mode stores bytes in S3.

## 5. API endpoints

- `GET /api/health` – backend status
- `GET /api/files` – list current demo user's files
- `POST /api/files` – upload multipart form field `file`
- `GET /api/files/:id/download` – download (AWS mode returns a short-lived presigned URL)
- `DELETE /api/files/:id` – delete object and metadata
