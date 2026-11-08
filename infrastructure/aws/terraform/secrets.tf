# Generated secrets never leave AWS: the instance reads this JSON at boot (via its IAM role) and
# writes the app's env file. Rotate by `terraform taint random_password.jwt` etc. and re-applying.

resource "random_password" "postgres" {
  length  = 32
  special = false # URL-safe: it goes into a connection string
}

resource "random_password" "jwt" {
  length  = 64
  special = false
}

resource "aws_secretsmanager_secret" "app" {
  name                    = "${local.name}/app"
  description             = "Beyond Books ${var.environment}: database password, JWT secret, AI keys"
  recovery_window_in_days = var.environment == "prod" ? 30 : 0
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({
    POSTGRES_PASSWORD       = random_password.postgres.result
    EDU3D_JWT_SECRET        = random_password.jwt.result
    EDU3D_ANTHROPIC_API_KEY = var.anthropic_api_key
    ELEVENLABS_API_KEY      = var.elevenlabs_api_key
    SEED_TEACHER_PASSWORD   = var.seed_teacher_password
    SEED_STUDENT_PASSWORD   = var.seed_student_password
  })
}
