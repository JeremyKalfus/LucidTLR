import type { LucideIcon } from "lucide-react-native";
import { BarChart3, BookOpen, House, NotebookPen, Settings } from "lucide-react-native";
import { router, usePathname } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { borders, colors, radii, typography } from "@/src/theme/tokens";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const navItems: NavItem[] = [
  { label: "guide", href: "/onboarding", icon: BookOpen },
  { label: "data", href: "/data", icon: BarChart3 },
  { label: "home", href: "/", icon: House },
  { label: "journal", href: "/journal", icon: NotebookPen },
  { label: "settings", href: "/settings", icon: Settings },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname.startsWith(href);
}

export function BottomNavigator() {
  const pathname = usePathname();

  return (
    <View
      style={{
        position: "absolute",
        left: 19,
        right: 19,
        bottom: 20,
        minHeight: 71,
        borderRadius: radii.bottomNav,
        borderWidth: borders.hairline,
        borderColor: colors.bottomNavBorder,
        backgroundColor: colors.bottomNav,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-around",
        paddingHorizontal: 12,
      }}
    >
      {navItems.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        const color = active ? colors.textMuted : colors.textDim;

        return (
          <Pressable
            accessibilityRole="button"
            key={item.href}
            onPress={() => router.push(item.href)}
            style={({ pressed }) => ({
              width: 58,
              height: 58,
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Icon color={color} size={23} strokeWidth={1.8} />
            <Text
              selectable
              style={{
                color,
                fontSize: typography.label.fontSize,
                lineHeight: typography.label.lineHeight,
              }}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
