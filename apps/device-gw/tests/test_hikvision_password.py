import unittest

from adapters.hikvision_isapi import hikvision_password_error, isapi_status_message


class HikvisionPasswordRulesTest(unittest.TestCase):
    def test_length(self):
        self.assertIsNotNone(hikvision_password_error("Ab1!xyz"))
        self.assertIsNone(hikvision_password_error("Abcd1234"))
        self.assertIsNotNone(hikvision_password_error("Abcd1234Abcd1234X"))

    def test_username_rejected(self):
        self.assertIsNotNone(hikvision_password_error("admin1234", "admin"))

    def test_need_two_classes(self):
        self.assertIsNotNone(hikvision_password_error("abcdefgh"))
        self.assertIsNone(hikvision_password_error("abcd1234"))

    def test_login_password_error(self):
        xml = (
            '<?xml version="1.0" encoding="UTF-8"?>'
            "<ResponseStatus>"
            "<statusString>Invalid Content</statusString>"
            "<subStatusCode>MessageParametersLack</subStatusCode>"
            "<errorMsg>loginPassword</errorMsg>"
            "</ResponseStatus>"
        )
        msg = isapi_status_message(400, xml)
        self.assertIn("loginPassword", msg)


if __name__ == "__main__":
    unittest.main()
