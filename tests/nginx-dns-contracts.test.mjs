import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const nginxConfigSource = await readFile(
  new URL('../../docker/nginx.conf', import.meta.url),
  'utf8',
)
const composeSource = await readFile(new URL('../../docker/docker-compose.yml', import.meta.url), 'utf8')

test('Nginx 通过 Docker DNS 动态解析 Admin 容器', () => {
  assert.match(nginxConfigSource, /resolver\s+127\.0\.0\.11\s+valid=\d+s\s+ipv6=off;/)
  assert.match(nginxConfigSource, /upstream\s+titanium_admin\s*\{[^}]*\bzone\b[^}]*\}/s)
  assert.match(nginxConfigSource, /server\s+titanium-admin:8090\s+resolve;/)
  assert.match(nginxConfigSource, /location\s+\/api\/\s*\{[^}]*proxy_pass\s+http:\/\/titanium_admin\/;/s)
})

test('Maintenance 退保价值 Feign 客户端配置 Product 容器直连地址', () => {
  assert.match(
    composeSource,
    /spring\.cloud\.openfeign\.client\.config\.maintenanceSurrenderValueApi\.url[^\n]*http:\/\/titanium-product:8082/,
  )
})
