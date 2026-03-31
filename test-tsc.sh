#!/bin/bash
# Test if tsc works on minimal example
echo "Creating test-minimal.ts..."
cat > test-minimal.ts << 'EOF'
const hello: string = "world";
console.log(hello);
EOF

echo "Running tsc on test-minimal.ts..."
npx tsc test-minimal.ts --outDir test-out

echo "Checking result..."
if [ -f test-out/test-minimal.js ]; then
  echo "✅ SUCCESS: test-out/test-minimal.js exists"
  cat test-out/test-minimal.js
else
  echo "❌ FAILED: test-out/test-minimal.js not found"
  echo "Contents of test-out:"
  ls -la test-out 2>/dev/null || echo "test-out doesn't exist"
fi
