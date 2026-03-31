#!/bin/bash
# Diagnóstico SQL direto no MySQL

mysql -h mysql -u root -proot -e "USE erp; SHOW TABLES LIKE '__drizzle%'; SELECT * FROM __drizzle_migrations LIMIT 5;"
