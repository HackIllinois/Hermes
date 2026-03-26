module.exports = {
    apps: [
        {
            name: "HERMES_API",
            script: "dist/index.js",
            cwd: "/home/ubuntu/hermes",
            instances: 1,
            exec_mode: "fork",
            out_file: "/home/ubuntu/.pm2/logs/hermes-api-out.log",
            err_file: "/home/ubuntu/.pm2/logs/hermes-api-err.log",
            combine_logs: true,
            log_date_format: "YYYY-MM-DD HH:mm:ss.SSS",
        },
    ],
};
