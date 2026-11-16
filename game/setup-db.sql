-- sudo mariadb < setup-db.sql   (change the password first, and put the same one in .env)
CREATE DATABASE IF NOT EXISTS dvtt CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'dvtt'@'localhost' IDENTIFIED BY 'doi_mat_khau_nay';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES ON dvtt.* TO 'dvtt'@'localhost';
FLUSH PRIVILEGES;
