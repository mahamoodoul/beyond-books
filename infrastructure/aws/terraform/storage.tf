# Private S3 bucket for uploads (textbook PDFs) and 3D models, so files survive a rebuild of the
# instance, plus a prefix for nightly Postgres dumps. Everything encrypted, nothing public.

resource "random_id" "bucket" {
  byte_length = 3
}

resource "aws_s3_bucket" "storage" {
  bucket        = "${local.name}-storage-${random_id.bucket.hex}"
  force_destroy = var.environment != "prod"
  tags          = { Name = "${local.name}-storage" }
}

resource "aws_s3_bucket_public_access_block" "storage" {
  bucket                  = aws_s3_bucket.storage.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "storage" {
  bucket = aws_s3_bucket.storage.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "storage" {
  bucket = aws_s3_bucket.storage.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_versioning" "storage" {
  bucket = aws_s3_bucket.storage.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "storage" {
  bucket     = aws_s3_bucket.storage.id
  depends_on = [aws_s3_bucket_versioning.storage]

  rule {
    id     = "backups-expire"
    status = "Enabled"
    filter {
      prefix = "backups/"
    }
    expiration {
      days = var.backup_retention_days
    }
  }

  rule {
    id     = "old-versions"
    status = "Enabled"
    filter {
      prefix = ""
    }
    noncurrent_version_expiration {
      noncurrent_days = 14
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# Browser uploads go through presigned URLs from the API, so the bucket needs CORS for the app origin.
resource "aws_s3_bucket_cors_configuration" "storage" {
  bucket = aws_s3_bucket.storage.id
  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "HEAD"]
    allowed_origins = [local.public_url]
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}
