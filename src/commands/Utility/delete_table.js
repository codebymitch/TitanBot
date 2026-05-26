// file: delete_table.js
import { db } from '../../utils/database.js';

async function dropTable() {
    try {
        await pool.query('DROP TABLE IF EXISTS "role-save" CASCADE');
        console.log("Đã xóa bảng 'role-save' thành công!");
        process.exit(0);
    } catch (err) {
        console.error("Lỗi khi xóa bảng:", err);
        process.exit(1);
    }
}

dropTable();
