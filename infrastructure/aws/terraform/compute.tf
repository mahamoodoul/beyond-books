# One Ubuntu 24.04 instance running the Docker Compose stack. Elastic IP so the address survives
# stop/start (stop it outside demo hours: credits are only spent while it runs).

data "aws_ssm_parameter" "ubuntu_ami" {
  name = "/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id"
}

resource "aws_key_pair" "admin" {
  count      = var.ssh_public_key == "" ? 0 : 1
  key_name   = "${local.name}-admin"
  public_key = var.ssh_public_key
}

resource "aws_eip" "app" {
  domain = "vpc"
  tags   = { Name = local.name }
}

locals {
  host       = var.domain != "" ? var.domain : aws_eip.app.public_ip
  public_url = var.domain != "" ? "https://${var.domain}" : "http://${aws_eip.app.public_ip}"
}

resource "aws_instance" "app" {
  ami                         = data.aws_ssm_parameter.ubuntu_ami.value
  instance_type               = var.instance_type
  subnet_id                   = aws_subnet.public.id
  vpc_security_group_ids      = [aws_security_group.app.id]
  iam_instance_profile        = aws_iam_instance_profile.instance.name
  key_name                    = var.ssh_public_key == "" ? null : aws_key_pair.admin[0].key_name
  associate_public_ip_address = false
  monitoring                  = false # detailed monitoring costs; basic 5-minute metrics are free

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.root_volume_gb
    encrypted             = true
    delete_on_termination = var.environment != "prod"
  }

  metadata_options {
    http_tokens                 = "required" # IMDSv2 only
    http_put_response_hop_limit = 2          # containers reach the role credentials
  }

  credit_specification {
    cpu_credits = "standard" # "unlimited" can bill extra; standard just throttles
  }

  user_data = templatefile("${path.module}/user_data.sh.tftpl", {
    project            = var.project
    environment        = var.environment
    region             = var.region
    git_repo           = var.git_repo
    git_ref            = var.git_ref
    domain             = var.domain
    public_url         = local.public_url
    secret_id          = aws_secretsmanager_secret.app.name
    bucket             = aws_s3_bucket.storage.bucket
    enable_blender     = var.enable_blender
    demo_mode          = var.demo_mode
    seed_demo_data     = var.seed_demo_data
    seed_teacher_email = var.seed_teacher_email
    seed_student_email = var.seed_student_email
    anthropic_model    = var.anthropic_model
    has_anthropic_key  = var.anthropic_api_key != ""
  })
  user_data_replace_on_change = true

  tags = { Name = local.name }

  lifecycle {
    ignore_changes = [ami] # a new Ubuntu AMI must not recreate the box by surprise
  }
}

resource "aws_eip_association" "app" {
  instance_id   = aws_instance.app.id
  allocation_id = aws_eip.app.id
}

# Free CloudWatch alarms: the instance failing its status checks, and a t3 running out of CPU credits.
resource "aws_cloudwatch_metric_alarm" "status" {
  alarm_name          = "${local.name}-status-check"
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  dimensions          = { InstanceId = aws_instance.app.id }
  alarm_actions       = ["arn:aws:automate:${var.region}:ec2:reboot"]
  treat_missing_data  = "notBreaching"
}

resource "aws_cloudwatch_metric_alarm" "cpu_credits" {
  count               = startswith(var.instance_type, "t") ? 1 : 0
  alarm_name          = "${local.name}-cpu-credits-low"
  namespace           = "AWS/EC2"
  metric_name         = "CPUCreditBalance"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 20
  comparison_operator = "LessThanThreshold"
  dimensions          = { InstanceId = aws_instance.app.id }
  treat_missing_data  = "notBreaching"
}
