#!/bin/bash

# Deploy Script for ERP Application
# Usage: ./deploy.sh [development|production]

set -e  # Exit on any error

# Configuration
ENVIRONMENT=${1:-production}
APP_NAME="erp-server"
BACKUP_DIR="./backups"
LOG_DIR="./logs"

echo "🚀 Starting deployment for $ENVIRONMENT environment..."

# Create necessary directories
mkdir -p $BACKUP_DIR
mkdir -p $LOG_DIR

# Function to backup current deployment
backup_current() {
    echo "📦 Backing up current deployment..."
    if pm2 list | grep -q $APP_NAME; then
        pm2 dump $BACKUP_DIR/pm2-backup-$(date +%Y%m%d-%H%M%S).dump
    fi
}

# Function to install dependencies
install_deps() {
    echo "📦 Installing dependencies..."
    pnpm install --frozen-lockfile --prod
}

# Function to build application
build_app() {
    echo "🔨 Building application..."
    pnpm run build
    
    # Verify build
    if [ ! -d "dist/server" ]; then
        echo "❌ Build failed - missing server directory"
        exit 1
    fi
}

# Function to run tests
run_tests() {
    echo "🧪 Running tests..."
    pnpm run check:server
    pnpm test
}

# Function to deploy with PM2
deploy_pm2() {
    echo "🔄 Deploying with PM2..."
    
    # Stop existing processes
    pm2 stop $APP_NAME || echo "No existing process to stop"
    pm2 delete $APP_NAME || echo "No existing process to delete"
    
    # Start new process
    if [ "$ENVIRONMENT" = "development" ]; then
        pm2 start deployment/ecosystem.config.js --env development --update-env
    else
        pm2 start deployment/ecosystem.config.js --env production --update-env
    fi
    
    # Save PM2 configuration
    pm2 save
    
    # Generate startup script
    pm2 startup
}

# Function to health check
health_check() {
    echo "🏥 Running health check..."
    sleep 5
    
    # Check PM2 status
    pm2 status
    
    # Check application health
    for i in {1..10}; do
        if curl -f http://localhost:3000/health >/dev/null 2>&1; then
            echo "✅ Health check passed"
            return 0
        fi
        echo "⏳ Waiting for application to start... ($i/10)"
        sleep 3
    done
    
    echo "❌ Health check failed"
    pm2 logs $APP_NAME --lines 20
    exit 1
}

# Function to rollback
rollback() {
    echo "🔄 Rolling back..."
    pm2 stop $APP_NAME || true
    pm2 delete $APP_NAME || true
    
    # Restore from latest backup if exists
    LATEST_BACKUP=$(ls -t $BACKUP_DIR/pm2-backup-*.dump 2>/dev/null | head -1)
    if [ -n "$LATEST_BACKUP" ]; then
        pm2 resurrect $LATEST_BACKUP
        echo "✅ Rollback completed"
    else
        echo "❌ No backup found for rollback"
        exit 1
    fi
}

# Main deployment flow
main() {
    # Backup current deployment
    backup_current
    
    # Install dependencies
    install_deps
    
    # Run tests (skip for production rollback)
    if [ "$ENVIRONMENT" != "production" ] || [ "$2" != "rollback" ]; then
        run_tests
    fi
    
    # Build application
    build_app
    
    # Deploy
    deploy_pm2
    
    # Health check
    health_check
    
    echo "✅ Deployment completed successfully!"
    echo "📊 Application status:"
    pm2 status
    echo "📋 Recent logs:"
    pm2 logs $APP_NAME --lines 5
}

# Handle rollback
if [ "$2" = "rollback" ]; then
    rollback
else
    main
fi
