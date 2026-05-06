# PostgreSQL Portable 실행 스크립트 (관리자 권한 불필요)
# 사전 준비:
#   1. https://www.postgresql.org/download/windows/ 에서 "zip archive" 다운로드
#   2. 아래 $PG_DIR 경로에 압축 해제

$PG_DIR   = "$env:USERPROFILE\postgresql-16"
$PG_DATA  = "$env:USERPROFILE\pgdata-eb-fcst"
$PG_PORT  = "5432"
$PG_USER  = "ebfcst"
$PG_PASS  = "EbFcst2025!"
$PG_DB    = "eb_fcst"
$PG_BIN   = "$PG_DIR\bin"

if (-not (Test-Path $PG_BIN)) {
    Write-Host "❌ PostgreSQL 바이너리를 찾을 수 없습니다: $PG_BIN"
    Write-Host "   https://www.enterprisedb.com/download-postgresql-binaries 에서 zip 다운로드 후 $PG_DIR 에 압축 해제하세요."
    exit 1
}

# 최초 1회: DB 클러스터 초기화
if (-not (Test-Path "$PG_DATA\PG_VERSION")) {
    Write-Host "🔧 DB 클러스터 초기화 중..."
    & "$PG_BIN\initdb.exe" -D $PG_DATA -U $PG_USER --pwfile=<(Write-Output $PG_PASS) -E UTF8 --locale=C
    Write-Host "✅ 초기화 완료"
}

# PostgreSQL 시작
Write-Host "🚀 PostgreSQL 시작 (포트 $PG_PORT)..."
& "$PG_BIN\pg_ctl.exe" -D $PG_DATA -l "$PG_DATA\pg.log" start

Start-Sleep 2

# DB 생성 (최초 1회)
& "$PG_BIN\psql.exe" -U $PG_USER -p $PG_PORT -c "CREATE DATABASE $PG_DB;" 2>$null
Write-Host "✅ PostgreSQL 실행 중. DATABASE_URL 확인:"
Write-Host "   postgresql://${PG_USER}:${PG_PASS}@localhost:${PG_PORT}/${PG_DB}?schema=public"
