import {AppSettingKey, KeyVaultAuthType} from "@/prisma/generated/enums";

export type AppSettingValueType = {
    [AppSettingKey.ALLOW_USER_SIGNUP]: boolean;
    [AppSettingKey.ALLOW_USER_ACCOUNT_DELETION]: boolean;
    [AppSettingKey.ALLOW_INVITE_CODE_GENERATION]: boolean;
    [AppSettingKey.VAULT_ALLOW_PASSWORD_CHANGE]: boolean;
    [AppSettingKey.VAULT_BLOCK_USER_ON_INCORRECT_PASSWORD]: boolean;
    [AppSettingKey.VAULT_BLOCK_DURATION_SECONDS]: number;
    [AppSettingKey.VAULT_BLOCK_AFTER_ATTEMPTS]: number;
    [AppSettingKey.VAULT_DEFAULT_AUTH_TYPE]: KeyVaultAuthType;
    [AppSettingKey.VAULT_AUTH_ALLOW_PASSWORD]: boolean;
    [AppSettingKey.VAULT_AUTH_ALLOW_PIN]: boolean;
    [AppSettingKey.VAULT_PASSWORD_MIN_LENGTH]: number;
    [AppSettingKey.VAULT_PASSWORD_MAX_LENGTH]: number;
    [AppSettingKey.VAULT_PIN_MIN_LENGTH]: number;
    [AppSettingKey.VAULT_PIN_MAX_LENGTH]: number;
    [AppSettingKey.ALLOW_VAULT_DELETION]: boolean;
    [AppSettingKey.DISABLE_VAULT_SHARING]: boolean;
    [AppSettingKey.ALLOW_PUBLIC_COLLECTIONS]: boolean;
    [AppSettingKey.ADMIN_CAN_CHANGE_RESOURCE_OWNER]: boolean;
    [AppSettingKey.MAX_VAULTS_PER_USER]: number;
    [AppSettingKey.MAX_COLLECTIONS_PER_USER]: number;
    [AppSettingKey.SESSION_TIMEOUT_SECONDS]: number;
    [AppSettingKey.ADMIN_CAN_DELETE_ANY_VAULT]: boolean;
    [AppSettingKey.ADMIN_CAN_DELETE_ANY_COLLECTION]: boolean;
    [AppSettingKey.UI_GAME_LIBRARY_PRERENDERED_ROWS]: number;
}