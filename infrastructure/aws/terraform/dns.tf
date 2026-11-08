# Optional: an A record in your Route 53 zone. Without a zone, point your DNS at the Elastic IP
# (output `public_ip`); Caddy obtains the TLS certificate as soon as the name resolves.

resource "aws_route53_record" "app" {
  count   = var.domain != "" && var.hosted_zone_id != "" ? 1 : 0
  zone_id = var.hosted_zone_id
  name    = var.domain
  type    = "A"
  ttl     = 300
  records = [aws_eip.app.public_ip]
}
