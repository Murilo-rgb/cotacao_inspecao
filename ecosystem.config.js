module.exports = {
  apps: [{
    name: 'geo-pme-notas',
    script: './server.js',
    watch: false,
    env: {
      NODE_ENV: 'production',
      PORT: 3016
    },
    max_restarts: 10,
    restart_delay: 5000,
    log_date_format: 'DD/MM/YYYY HH:mm:ss',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    merge_logs: true
  }]
};