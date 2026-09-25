-- REF-1: seed data for the reference tables (V072).
-- Kept in its own changelog, apart from the DDL, so ReferenceApiIntegrationTest can run exactly this
-- file against H2 and assert the real seed content -- the H2 schema.sql mirror carries no seed rows.
-- Plain standard SQL on purpose (no Postgres-only syntax) so that works. Encoding: UTF-8.
--
-- Countries: VIETNAM ONLY for now (scope change at REF-1 pickup, 2026-09-25; the rest of ISO 3166-1
-- is REF-4). Regions: Vietnam only, by design (REFERENCE_DATA_DESIGN.md section 8). Region codes are
-- ISO 3166-2:VN; REF-2's bundled polygons must match them 1:1 and REF-3 refreshes the list to the
-- 2025 province merger (63 -> 34). Nothing may depend on Vietnam's generated id -- look it up by iso2.

INSERT INTO languages (code, name, native_name, sort_order) VALUES
    ('en', 'English',    'English',    1),
    ('vi', 'Vietnamese', 'Tiếng Việt', 2);

INSERT INTO countries (iso2, iso3, name) VALUES
    ('VN', 'VNM', 'Vietnam');

INSERT INTO regions (country_id, iso_code, name, native_name)
SELECT c.id, v.iso_code, v.name, v.native_name
FROM countries c
CROSS JOIN (VALUES
    -- 58 provinces
    ('VN-44', 'An Giang',           'An Giang'),
    ('VN-43', 'Ba Ria - Vung Tau',  'Bà Rịa - Vũng Tàu'),
    ('VN-54', 'Bac Giang',          'Bắc Giang'),
    ('VN-53', 'Bac Kan',            'Bắc Kạn'),
    ('VN-55', 'Bac Lieu',           'Bạc Liêu'),
    ('VN-56', 'Bac Ninh',           'Bắc Ninh'),
    ('VN-50', 'Ben Tre',            'Bến Tre'),
    ('VN-31', 'Binh Dinh',          'Bình Định'),
    ('VN-57', 'Binh Duong',         'Bình Dương'),
    ('VN-58', 'Binh Phuoc',         'Bình Phước'),
    ('VN-40', 'Binh Thuan',         'Bình Thuận'),
    ('VN-59', 'Ca Mau',             'Cà Mau'),
    ('VN-04', 'Cao Bang',           'Cao Bằng'),
    ('VN-33', 'Dak Lak',            'Đắk Lắk'),
    ('VN-72', 'Dak Nong',           'Đắk Nông'),
    ('VN-71', 'Dien Bien',          'Điện Biên'),
    ('VN-39', 'Dong Nai',           'Đồng Nai'),
    ('VN-45', 'Dong Thap',          'Đồng Tháp'),
    ('VN-30', 'Gia Lai',            'Gia Lai'),
    ('VN-03', 'Ha Giang',           'Hà Giang'),
    ('VN-63', 'Ha Nam',             'Hà Nam'),
    ('VN-23', 'Ha Tinh',            'Hà Tĩnh'),
    ('VN-61', 'Hai Duong',          'Hải Dương'),
    ('VN-73', 'Hau Giang',          'Hậu Giang'),
    ('VN-14', 'Hoa Binh',           'Hòa Bình'),
    ('VN-66', 'Hung Yen',           'Hưng Yên'),
    ('VN-34', 'Khanh Hoa',          'Khánh Hòa'),
    ('VN-47', 'Kien Giang',         'Kiên Giang'),
    ('VN-28', 'Kon Tum',            'Kon Tum'),
    ('VN-01', 'Lai Chau',           'Lai Châu'),
    ('VN-35', 'Lam Dong',           'Lâm Đồng'),
    ('VN-09', 'Lang Son',           'Lạng Sơn'),
    ('VN-02', 'Lao Cai',            'Lào Cai'),
    ('VN-41', 'Long An',            'Long An'),
    ('VN-67', 'Nam Dinh',           'Nam Định'),
    ('VN-22', 'Nghe An',            'Nghệ An'),
    ('VN-18', 'Ninh Binh',          'Ninh Bình'),
    ('VN-36', 'Ninh Thuan',         'Ninh Thuận'),
    ('VN-68', 'Phu Tho',            'Phú Thọ'),
    ('VN-32', 'Phu Yen',            'Phú Yên'),
    ('VN-24', 'Quang Binh',         'Quảng Bình'),
    ('VN-27', 'Quang Nam',          'Quảng Nam'),
    ('VN-29', 'Quang Ngai',         'Quảng Ngãi'),
    ('VN-13', 'Quang Ninh',         'Quảng Ninh'),
    ('VN-25', 'Quang Tri',          'Quảng Trị'),
    ('VN-52', 'Soc Trang',          'Sóc Trăng'),
    ('VN-05', 'Son La',             'Sơn La'),
    ('VN-37', 'Tay Ninh',           'Tây Ninh'),
    ('VN-20', 'Thai Binh',          'Thái Bình'),
    ('VN-69', 'Thai Nguyen',        'Thái Nguyên'),
    ('VN-21', 'Thanh Hoa',          'Thanh Hóa'),
    ('VN-26', 'Thua Thien-Hue',     'Thừa Thiên Huế'),
    ('VN-46', 'Tien Giang',         'Tiền Giang'),
    ('VN-51', 'Tra Vinh',           'Trà Vinh'),
    ('VN-07', 'Tuyen Quang',        'Tuyên Quang'),
    ('VN-49', 'Vinh Long',          'Vĩnh Long'),
    ('VN-70', 'Vinh Phuc',          'Vĩnh Phúc'),
    ('VN-06', 'Yen Bai',            'Yên Bái'),
    -- 5 centrally-governed municipalities
    ('VN-CT', 'Can Tho',            'Cần Thơ'),
    ('VN-DN', 'Da Nang',            'Đà Nẵng'),
    ('VN-HN', 'Ha Noi',             'Hà Nội'),
    ('VN-HP', 'Hai Phong',          'Hải Phòng'),
    ('VN-SG', 'Ho Chi Minh',        'Hồ Chí Minh')
) AS v (iso_code, name, native_name)
WHERE c.iso2 = 'VN';
