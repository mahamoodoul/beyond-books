output "public_ip" {
  description = "Elastic IP of the instance (point your DNS A record here)."
  value       = aws_eip.app.public_ip
}

output "url" {
  description = "Where the app answers once the first boot has finished (5-10 minutes)."
  value       = local.public_url
}

output "instance_id" {
  value = aws_instance.app.id
}

output "shell" {
  description = "Open a shell on the box without SSH or keys."
  value       = "aws ssm start-session --region ${var.region} --target ${aws_instance.app.id}"
}

output "first_boot_log" {
  description = "Follow the first boot (Docker build, migrations, seed) from an SSM shell."
  value       = "sudo tail -f /var/log/beyond-books-boot.log"
}

output "storage_bucket" {
  value = aws_s3_bucket.storage.bucket
}

output "secret_name" {
  description = "Secrets Manager entry with the generated database password, JWT secret and AI keys."
  value       = aws_secretsmanager_secret.app.name
}

output "stop_start" {
  description = "Credits are only spent while the instance runs."
  value = {
    stop  = "aws ec2 stop-instances --region ${var.region} --instance-ids ${aws_instance.app.id}"
    start = "aws ec2 start-instances --region ${var.region} --instance-ids ${aws_instance.app.id}"
  }
}
