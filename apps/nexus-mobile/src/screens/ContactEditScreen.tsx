import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { toContactId, type AccountId, type Contact } from '@nexus/domain';
import { radius, space, typography } from '@nexus/ui-kit';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

interface Props {
  readonly account: AccountId;
  /** Vorhandener Kontakt = Bearbeiten; ohne = Neu anlegen. */
  readonly contact?: Contact;
  readonly onCancel: () => void;
  readonly onSave: (contact: Contact) => Promise<void>;
}

/** Formularzeile mit Beschriftung über einem Eingabefeld. */
function Field({
  label,
  value,
  onChange,
  s,
  t,
  keyboardType,
  multiline,
  autoFocus,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (v: string) => void;
  readonly s: Styles;
  readonly t: AppTheme;
  readonly keyboardType?: 'default' | 'email-address' | 'phone-pad';
  readonly multiline?: boolean;
  readonly autoFocus?: boolean;
}): React.JSX.Element {
  return (
    <View style={s.fieldWrap}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={[s.input, multiline === true ? s.inputMultiline : null]}
        value={value}
        onChangeText={onChange}
        placeholderTextColor={t.c.textSecondary}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
        autoCorrect={false}
        keyboardType={keyboardType ?? 'default'}
        multiline={multiline === true}
        textAlignVertical={multiline === true ? 'top' : 'center'}
        autoFocus={autoFocus === true}
      />
    </View>
  );
}

/** Kontakt anlegen oder bearbeiten — Formular über die getesteten Container-Schreibmethoden. */
export function ContactEditScreen({
  account,
  contact,
  onCancel,
  onSave,
}: Props): React.JSX.Element {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);

  const [givenName, setGivenName] = useState(contact?.givenName ?? '');
  const [surname, setSurname] = useState(contact?.surname ?? '');
  const [displayName, setDisplayName] = useState(contact?.displayName ?? '');
  const [email, setEmail] = useState(contact?.emailAddresses[0]?.address ?? '');
  const [company, setCompany] = useState(contact?.company ?? '');
  const [jobTitle, setJobTitle] = useState(contact?.jobTitle ?? '');
  const [mobilePhone, setMobilePhone] = useState(contact?.mobilePhone ?? '');
  const [businessPhone, setBusinessPhone] = useState(contact?.businessPhone ?? '');
  const [homePhone, setHomePhone] = useState(contact?.homePhone ?? '');
  const [notes, setNotes] = useState(contact?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (): Promise<void> => {
    if (busy) return;
    const dn =
      displayName.trim().length > 0
        ? displayName.trim()
        : [givenName.trim(), surname.trim()].filter((x) => x.length > 0).join(' ') || email.trim();
    if (dn.length === 0) {
      setError('Bitte mindestens einen Namen oder eine E-Mail angeben.');
      return;
    }
    const built: Contact = {
      id: contact?.id ?? toContactId(''),
      accountId: account,
      displayName: dn,
      emailAddresses: email.trim().length > 0 ? [{ address: email.trim() }] : [],
      ...(givenName.trim().length > 0 ? { givenName: givenName.trim() } : {}),
      ...(surname.trim().length > 0 ? { surname: surname.trim() } : {}),
      ...(company.trim().length > 0 ? { company: company.trim() } : {}),
      ...(jobTitle.trim().length > 0 ? { jobTitle: jobTitle.trim() } : {}),
      ...(mobilePhone.trim().length > 0 ? { mobilePhone: mobilePhone.trim() } : {}),
      ...(businessPhone.trim().length > 0 ? { businessPhone: businessPhone.trim() } : {}),
      ...(homePhone.trim().length > 0 ? { homePhone: homePhone.trim() } : {}),
      ...(notes.trim().length > 0 ? { notes: notes.trim() } : {}),
    };
    setBusy(true);
    setError(null);
    try {
      await onSave(built);
    } catch {
      setError('Speichern fehlgeschlagen. Bitte erneut versuchen.');
      setBusy(false);
    }
  };

  return (
    <View style={s.container}>
      <View style={s.bar}>
        <Pressable onPress={onCancel} hitSlop={8}>
          <Text style={s.barAction}>Abbrechen</Text>
        </Pressable>
        <Text style={s.barTitle}>
          {contact !== undefined ? 'Kontakt bearbeiten' : 'Neuer Kontakt'}
        </Text>
        <Pressable onPress={() => void save()} disabled={busy} hitSlop={8}>
          {busy ? (
            <ActivityIndicator color={t.c.brandPrimary} />
          ) : (
            <Text style={s.barSave}>Sichern</Text>
          )}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Field label="Vorname" value={givenName} onChange={setGivenName} s={s} t={t} autoFocus />
        <Field label="Nachname" value={surname} onChange={setSurname} s={s} t={t} />
        <Field
          label="Anzeigename (optional)"
          value={displayName}
          onChange={setDisplayName}
          s={s}
          t={t}
        />
        <Field
          label="E-Mail"
          value={email}
          onChange={setEmail}
          s={s}
          t={t}
          keyboardType="email-address"
        />
        <Field label="Firma" value={company} onChange={setCompany} s={s} t={t} />
        <Field label="Position" value={jobTitle} onChange={setJobTitle} s={s} t={t} />
        <Field
          label="Mobil"
          value={mobilePhone}
          onChange={setMobilePhone}
          s={s}
          t={t}
          keyboardType="phone-pad"
        />
        <Field
          label="Geschäftlich"
          value={businessPhone}
          onChange={setBusinessPhone}
          s={s}
          t={t}
          keyboardType="phone-pad"
        />
        <Field
          label="Privat"
          value={homePhone}
          onChange={setHomePhone}
          s={s}
          t={t}
          keyboardType="phone-pad"
        />
        <Field label="Notiz" value={notes} onChange={setNotes} s={s} t={t} multiline />

        {error !== null ? <Text style={s.error}>{error}</Text> : null}
      </ScrollView>
    </View>
  );
}

type Styles = ReturnType<typeof makeStyles>;

function makeStyles(t: AppTheme) {
  return StyleSheet.create({
    bar: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
    },
    barAction: { color: t.c.textSecondary, fontSize: typography.body.size },
    barSave: { color: t.c.brandPrimary, fontSize: typography.body.size, fontWeight: '700' },
    barTitle: { color: t.c.textPrimary, fontSize: typography.body.size, fontWeight: '600' },
    container: { backgroundColor: t.c.bgCanvas, flex: 1 },
    content: { padding: space.md, paddingBottom: space.xl },
    error: { color: t.c.danger, fontSize: typography.caption.size, marginTop: space.sm },
    fieldWrap: { marginBottom: space.sm },
    input: {
      backgroundColor: t.c.bgElevated,
      borderRadius: radius.md,
      color: t.c.textPrimary,
      fontSize: typography.body.size,
      padding: space.md,
    },
    inputMultiline: { minHeight: 96 },
    label: { color: t.c.textSecondary, fontSize: typography.caption.size, marginBottom: space.xxs },
  });
}
