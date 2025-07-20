#!/bin/bash
# Solace Voice Companion Setup Script
# This script helps you configure API keys and set up the project

set -e

echo "🎤 Solace Voice Companion Setup"
echo "================================="
echo ""

# Check if .env files exist
if [ ! -f ".env" ]; then
    echo "⚠️  Root .env file not found. Creating from template..."
    cp .env.example .env
fi

if [ ! -f "task-C/.env" ]; then
    echo "⚠️  task-C/.env file not found. Creating from template..."
    cp task-C/.env.example task-C/.env
fi

echo "📋 Configuration Status:"
echo "========================"

# Check OpenAI API key
if grep -q "sk-your-openai-api-key-here" task-C/.env 2>/dev/null; then
    echo "❌ OpenAI API Key: NOT CONFIGURED"
    echo "   → Get your key from: https://platform.openai.com/api-keys"
    echo "   → Edit task-C/.env and replace 'sk-your-openai-api-key-here'"
    OPENAI_MISSING=true
else
    echo "✅ OpenAI API Key: CONFIGURED"
    OPENAI_MISSING=false
fi

# Check AWS credentials
if grep -q "your-aws-access-key-id" task-C/.env 2>/dev/null; then
    echo "⚠️  AWS Credentials: NOT CONFIGURED (Optional)"
    echo "   → Get credentials from: https://console.aws.amazon.com/iam/"
    echo "   → Edit task-C/.env to add your AWS credentials"
    echo "   → Note: App will use Web Speech API as fallback"
    AWS_MISSING=true
else
    echo "✅ AWS Credentials: CONFIGURED"
    AWS_MISSING=false
fi

# Check Solace API URL
if grep -q "https://your-lambda-url" task-C/.env 2>/dev/null; then
    echo "⚠️  Solace API URL: NOT CONFIGURED (Optional)"
    echo "   → Deploy Task A first to get the Lambda URL"
    echo "   → Note: App will use local storage as fallback"
    SOLACE_MISSING=true
else
    echo "✅ Solace API URL: CONFIGURED"
    SOLACE_MISSING=false
fi

echo ""
echo "🚀 Quick Start Options:"
echo "======================"

if [ "$OPENAI_MISSING" = true ]; then
    echo "1. MINIMUM SETUP (Recommended for testing):"
    echo "   - Get OpenAI API key from: https://platform.openai.com/api-keys"
    echo "   - Add $5-10 in credits to your OpenAI account"
    echo "   - Edit task-C/.env and replace the OpenAI key"
    echo "   - Run: cd task-C && npm install && npm run dev"
    echo ""
    echo "2. FULL SETUP (For production features):"
    echo "   - Complete step 1 above"
    echo "   - Get AWS credentials and deploy Task A"
    echo "   - Configure all environment variables"
else
    echo "✅ Ready to run! Execute: cd task-C && npm install && npm run dev"
fi

echo ""
echo "📚 Detailed Setup Guide:"
echo "========================"
echo "1. OpenAI API Key (REQUIRED):"
echo "   - Visit: https://platform.openai.com/"
echo "   - Sign up and add billing info"
echo "   - Create API key in the API Keys section"
echo "   - Copy key (starts with 'sk-') to task-C/.env"
echo ""
echo "2. AWS Setup (OPTIONAL):"
echo "   - Visit: https://aws.amazon.com/"
echo "   - Create account and go to IAM console"
echo "   - Create user with AmazonPollyFullAccess"
echo "   - Copy Access Key ID and Secret to task-C/.env"
echo ""
echo "3. Task A Lambda (OPTIONAL):"
echo "   - Configure AWS credentials in .env"
echo "   - Run: cd task-A && ./infra/deploy.sh"
echo "   - Run: cd task-A/infra && terraform init && terraform apply"
echo "   - Copy Lambda URL to task-C/.env"
echo ""
echo "💡 Pro Tips:"
echo "============"
echo "- The app works great with just OpenAI API key"
echo "- Web Speech API provides excellent TTS without AWS"
echo "- Local storage works fine without encrypted memory"
echo "- Start with minimum setup, add features later"
echo ""
echo "🔧 Troubleshooting:"
echo "==================="
echo "- If OpenAI quota exceeded: App falls back to demo mode"
echo "- If AWS Polly fails: App uses Web Speech API"
echo "- If Lambda fails: App uses local storage"
echo "- All services have graceful fallbacks built-in"
echo ""

if [ "$OPENAI_MISSING" = true ]; then
    echo "⚠️  NEXT STEP: Configure your OpenAI API key in task-C/.env"
    exit 1
else
    echo "✅ Setup complete! Run: cd task-C && npm run dev"
    exit 0
fi 