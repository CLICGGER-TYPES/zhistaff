#!/usr/bin/env bash
# 发布前隐私自检
#
# 用途：在 git commit / push 到 GitHub 之前跑一遍，确认没有把题库、私钥、
#      云环境 ID、内网地址之类的带出去。
#
# 用法：
#   bash tools/preflight-check.sh
#
# 退出码 0 = 干净，1 = 发现问题

set -u
cd "$(dirname "$0")/.." || exit 1

RED=$'\033[31m'; GRN=$'\033[32m'; YLW=$'\033[33m'; RST=$'\033[0m'
fail=0
warn=0

say_fail(){ printf '%s  ✗ %s%s\n' "$RED" "$1" "$RST"; fail=1; }
say_warn(){ printf '%s  ! %s%s\n' "$YLW" "$1" "$RST"; warn=1; }
say_ok(){   printf '%s  ✓ %s%s\n' "$GRN" "$1" "$RST"; }

# 没有 git 仓库就临时建一个用于比对（不产生提交）
TMPGIT=0
if [ ! -d .git ]; then
  git init -q
  TMPGIT=1
fi
git add -A 2>/dev/null

echo "== 1. 题库文件必须被忽略 =="
n=0
while IFS= read -r f; do
  n=$((n+1))
  git check-ignore -q "$f" || say_fail "未忽略: $f"
done < <(find . -name '*.bank' -not -path '*/node_modules/*' 2>/dev/null)
[ "$n" -eq 0 ] && say_warn "目录里没有 .bank 文件（跳过）"
[ "$n" -gt 0 ] && say_ok "检查 $n 个 .bank 文件"

echo
echo "== 2. 密钥 / 证书必须被忽略 =="
n=0
while IFS= read -r f; do
  n=$((n+1))
  git check-ignore -q "$f" || say_fail "未忽略: $f"
done < <(find . \( -name '*.key' -o -name '*.pem' -o -name '*.p12' -o -name '*.jks' -o -name '.env*' \) -not -path '*/node_modules/*' 2>/dev/null)
[ "$n" -eq 0 ] && say_ok "没有密钥类文件"
[ "$n" -gt 0 ] && say_ok "检查 $n 个密钥类文件"

echo
echo "== 3. 待提交文件里的敏感串 =="
FOUND=0
while IFS= read -r f; do
  [ -f "$f" ] || continue
  case "$f" in *.png|*.jpg|*.jar|*.ttf|*.woff*) continue ;; esac
  hits=$(grep -aoE '(wx[0-9a-f]{16}|cloudbase-[a-z0-9]{8,}|192\.168\.[0-9]+\.[0-9]+|10\.[0-9]+\.[0-9]+\.[0-9]+|BEGIN [A-Z ]*PRIVATE KEY)' "$f" 2>/dev/null | sort -u | head -3)
  if [ -n "$hits" ]; then
    say_fail "$f → $(echo "$hits" | tr '\n' ' ')"
    FOUND=1
  fi
done < <(git diff --cached --name-only 2>/dev/null)
[ "$FOUND" -eq 0 ] && say_ok "无残留"

echo
echo "== 4. 手机号 / 邮箱 =="
FOUND=0
while IFS= read -r f; do
  [ -f "$f" ] || continue
  case "$f" in *.png|*.jpg|*.jar|*.ttf|*.woff*|*package-lock.json) continue ;; esac
  hits=$(grep -aoE '(^|[^0-9])1[3-9][0-9]{9}([^0-9]|$)|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.(com|cn|net|org)' "$f" 2>/dev/null | grep -viE 'example|npmjs|schema|w3\.org|github\.com|apache\.org|android\.com' | sort -u | head -2)
  if [ -n "$hits" ]; then
    say_warn "$f → $(echo "$hits" | tr '\n' ' ')"
    FOUND=1
  fi
done < <(git diff --cached --name-only 2>/dev/null)
[ "$FOUND" -eq 0 ] && say_ok "无手机号/邮箱"

echo
echo "== 5. 待提交文件统计 =="
printf '  文件数: %s\n' "$(git diff --cached --name-only | wc -l)"
printf '  总大小: %s\n' "$(git diff --cached --name-only | xargs du -ch 2>/dev/null | tail -1 | cut -f1)"

# 清理临时 git
git reset -q 2>/dev/null
if [ "$TMPGIT" = "1" ]; then rm -rf .git; fi

echo
if [ "$fail" -eq 1 ]; then
  printf '%s结果：发现必须处理的问题，不要提交%s\n' "$RED" "$RST"
  exit 1
elif [ "$warn" -eq 1 ]; then
  printf '%s结果：有需要人工确认的项（警告不算阻塞）%s\n' "$YLW" "$RST"
  exit 0
else
  printf '%s结果：干净，可以提交%s\n' "$GRN" "$RST"
  exit 0
fi
